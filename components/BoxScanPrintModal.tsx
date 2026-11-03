import React, { FC, useEffect, useRef, useState } from 'react';
import { type GroupedSalesOrder } from '../types';
import { getBoxScanStatus, recordBoxScan, getPrintPack, type BoxScanStatus, type PrintPackDocument } from '../services/api';
import { PrinterIcon, XCircleIcon, CheckCircleIcon, AlertIcon, CubeIcon, RefreshIcon, ExternalLinkIcon } from './icons/Icons';
import LoadingCube from './LoadingCube';
import type { PDFDocument as PdfDoc } from 'pdf-lib';

// Before a shipment's documents print, every box's EasyEcom Box ID barcode is scanned.
// - The expected Box IDs are never shown (the backend sends hashes), so they can't be typed
//   in from the screen; a box's ID appears only once it has been scanned.
// - Each opening of this window is a new scan session. Printing unlocks only when one session
//   has every box, so leaving halfway means scanning everything again.
// - Documents print as two PDFs: 4x6 labels for the label printer, and A4 documents.

export interface ExtraPrintAction {
    label: string;
    onClick: () => void;
}

interface Props {
    so: GroupedSalesOrder;
    userName: string;
    onClose: () => void;
    addNotification: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
    // Channel documents drawn in the browser (box labels, appointment pass), unlocked with the rest
    extraPrints?: ExtraPrintAction[];
}

type Feedback = { tone: 'ok' | 'dup' | 'error'; text: string } | null;
type PackKind = 'label' | 'a4';
type PackedDocument = PrintPackDocument & { packs?: PackKind[] };
type BuiltPack = { labelUrl: string | null; a4Url: string | null; docs: PackedDocument[] };

// Same normalisation as the backend's normalizeBoxId_
const normalizeBoxId = (v: string) => String(v || '').trim().replace(/^[`']/, '').replace(/\.0+$/, '').toUpperCase();

// Same as the backend's boxIdHash_: SHA-256 hex of "<referenceCode>|<boxId>"
const sha256Hex = async (text: string) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const newSessionId = () => {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* falls through */ }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const beep = (ok: boolean) => {
    try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = ok ? 'sine' : 'square';
        osc.frequency.value = ok ? 880 : 220;
        gain.gain.value = 0.15;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (ok ? 0.08 : 0.35));
        osc.onended = () => ctx.close();
    } catch { /* sound is a nicety */ }
};

const base64ToBytes = (b64: string) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
};

// Page sizes in PDF points (72 per inch)
const LABEL_SIZE: [number, number] = [288, 432]; // 4 x 6 in
const A4_SIZE: [number, number] = [595.28, 841.89];
// A page this small is a label wherever it came from (4x6, 4x4, 3x5...)
const isLabelSized = (w: number, h: number) => Math.min(w, h) <= 4.3 * 72 && Math.max(w, h) <= 6.3 * 72;
const fitsIn = (w: number, h: number, [tw, th]: [number, number]) => {
    const [pw, ph] = w > h ? [th, tw] : [tw, th];
    return w <= pw * 1.03 && h <= ph * 1.03;
};

const BoxScanPrintModal: FC<Props> = ({ so, userName, onClose, addNotification, extraPrints = [] }) => {
    const [scanStatus, setScanStatus] = useState<BoxScanStatus | null>(null);
    const [loadError, setLoadError] = useState('');
    const [input, setInput] = useState('');
    const [pending, setPending] = useState<string[]>([]);
    const [feedback, setFeedback] = useState<Feedback>(null);
    const [preparing, setPreparing] = useState<PackKind | null>(null);
    const [printedDocs, setPrintedDocs] = useState<PackedDocument[] | null>(null);
    const [emptyPacks, setEmptyPacks] = useState<PackKind[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    const sessionIdRef = useRef(newSessionId());
    const hashesRef = useRef<string[]>([]);
    const inFlightRef = useRef<Set<string>>(new Set());
    const scannedRef = useRef<Set<string>>(new Set());
    const packRef = useRef<Promise<BuiltPack> | null>(null);
    const urlsRef = useRef<string[]>([]);

    useEffect(() => () => urlsRef.current.forEach(u => URL.revokeObjectURL(u)), []);

    const applyStatus = async (res: BoxScanStatus) => {
        // An older backend still sends the IDs themselves; hash them here and never show them
        hashesRef.current = res.expectedBoxHashes
            || await Promise.all((res.expectedBoxIds || []).map(b => sha256Hex(`${so.id}|${normalizeBoxId(b)}`)));
        scannedRef.current = new Set((res.scans || []).map(s => s.boxId));
        setScanStatus({ ...res, expectedCount: res.expectedCount ?? (res.expectedBoxIds || []).length, expectedBoxIds: undefined });
    };

    const load = async () => {
        setLoadError('');
        try {
            const res = await getBoxScanStatus(so.id, sessionIdRef.current);
            if (res.status !== 'success') throw new Error(res.message || 'Could not load the box list.');
            await applyStatus(res);
        } catch (e: any) {
            setLoadError(e.message || 'Could not load the box list.');
        }
    };

    useEffect(() => { load(); }, [so.id]);
    useEffect(() => { if (scanStatus) inputRef.current?.focus(); }, [scanStatus]);

    const expectedCount = scanStatus?.expectedCount || 0;
    const scans = scanStatus?.scans || [];
    const scannedIds = new Set(scans.map(s => s.boxId));
    const tiles: { boxId: string; by?: string; at?: string; saving?: boolean }[] = [
        ...scans.map(s => ({ boxId: s.boxId, by: s.scannedBy, at: s.scannedAt })),
        ...pending.filter(b => !scannedIds.has(b)).map(b => ({ boxId: b, saving: true })),
    ];
    const scannedCount = Math.min(tiles.length, expectedCount);
    const isComplete = !!scanStatus?.complete && pending.length === 0;
    const showAbandoned = !!scanStatus && !scanStatus.complete && (scanStatus.abandonedCount || 0) > 0 && tiles.length === 0;

    const submitScan = async (raw: string) => {
        const boxId = normalizeBoxId(raw);
        setInput('');
        inputRef.current?.focus();
        if (!boxId || !scanStatus) return;

        if (scannedRef.current.has(boxId) || inFlightRef.current.has(boxId)) {
            beep(false);
            setFeedback({ tone: 'dup', text: `Box ${boxId} is already scanned.` });
            return;
        }
        inFlightRef.current.add(boxId);

        const belongsHere = hashesRef.current.includes(await sha256Hex(`${so.id}|${boxId}`));
        if (belongsHere) {
            beep(true);
            setPending(p => [...p, boxId]);
            setFeedback({ tone: 'ok', text: `Box ${boxId} scanned.` });
        } else {
            beep(false);
            setFeedback({ tone: 'error', text: `Box ${boxId} is not part of ${so.id}. Checking which order it belongs to...` });
        }

        // Saved one at a time so the backend lock never turns scans away
        queueRef.current = queueRef.current.then(async () => {
            try {
                const res = await recordBoxScan(so.id, boxId, userName, sessionIdRef.current);
                if (res.status === 'success') {
                    await applyStatus(res);
                } else {
                    if (belongsHere) beep(false);
                    setFeedback({ tone: 'error', text: res.message || `Box ${boxId} was not saved. Scan it again.` });
                }
            } catch (e: any) {
                if (belongsHere) beep(false);
                setFeedback({ tone: 'error', text: `Box ${boxId} was not saved (${e.message}). Scan it again.` });
            } finally {
                inFlightRef.current.delete(boxId);
                setPending(p => p.filter(b => b !== boxId));
            }
        });
    };

    const handleClose = () => {
        if (scanStatus && !isComplete && scannedCount > 0) {
            const leave = window.confirm(
                `Only ${scannedCount} of ${expectedCount} boxes are scanned.\n\n` +
                `If you leave now, these scans are discarded and every box has to be scanned again next time.\n\nLeave anyway?`
            );
            if (!leave) { inputRef.current?.focus(); return; }
        }
        onClose();
    };

    // Downloads the documents once and builds both PDFs: 4x6 labels and A4 documents
    const buildPack = async (): Promise<BuiltPack> => {
        const res = await getPrintPack(so.id);
        if (res.status !== 'success') throw new Error(res.message || 'Could not collect the documents.');

        const { PDFDocument } = await import('pdf-lib');
        const out: Record<PackKind, PdfDoc> = { label: await PDFDocument.create(), a4: await PDFDocument.create() };
        const docs: PackedDocument[] = [];

        for (const doc of res.documents || []) {
            if (!doc.base64) { docs.push(doc); continue; }
            try {
                const bytes = base64ToBytes(doc.base64);
                const packs = new Set<PackKind>();
                if (doc.mimeType === 'application/pdf') {
                    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
                    for (const i of src.getPageIndices()) {
                        const srcPage = src.getPage(i);
                        const { width, height } = srcPage.getSize();
                        const pack: PackKind = doc.kind === 'label' || isLabelSized(width, height) ? 'label' : 'a4';
                        packs.add(pack);
                        const target = out[pack];
                        // A label bigger than 4x6 is scaled down onto a 4x6 page; everything else is copied as is
                        if (pack === 'label' && !fitsIn(width, height, LABEL_SIZE) && srcPage.getRotation().angle % 360 === 0) {
                            const embedded = await target.embedPage(srcPage);
                            const [pw, ph] = width > height ? [LABEL_SIZE[1], LABEL_SIZE[0]] : LABEL_SIZE;
                            const scale = Math.min(pw / width, ph / height);
                            const page = target.addPage([pw, ph]);
                            page.drawPage(embedded, { x: (pw - width * scale) / 2, y: (ph - height * scale) / 2, xScale: scale, yScale: scale });
                        } else {
                            const [copied] = await target.copyPages(src, [i]);
                            target.addPage(copied);
                        }
                    }
                } else {
                    const pack: PackKind = doc.kind === 'label' ? 'label' : 'a4';
                    packs.add(pack);
                    const target = out[pack];
                    const img = doc.mimeType === 'image/png' ? await target.embedPng(bytes) : await target.embedJpg(bytes);
                    const size = pack === 'label' ? LABEL_SIZE : A4_SIZE;
                    const [pw, ph] = img.width > img.height ? [size[1], size[0]] : size;
                    const scale = Math.min(pw / img.width, ph / img.height);
                    const page = target.addPage([pw, ph]);
                    page.drawImage(img, { x: (pw - img.width * scale) / 2, y: (ph - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
                }
                docs.push({ ...doc, base64: undefined, packs: Array.from(packs) });
            } catch (e: any) {
                docs.push({ ...doc, base64: undefined, error: `Could not read the file (${e.message})` });
            }
        }

        const toUrl = async (pdf: PdfDoc) => {
            if (pdf.getPageCount() === 0) return null;
            const url = URL.createObjectURL(new Blob([(await pdf.save()) as BlobPart], { type: 'application/pdf' }));
            urlsRef.current.push(url);
            return url;
        };
        return { labelUrl: await toUrl(out.label), a4Url: await toUrl(out.a4), docs };
    };

    const handlePrint = async (which: PackKind) => {
        const name = which === 'label' ? '4x6 labels' : 'A4 documents';
        // Opened inside the click so the popup blocker allows it; filled once the PDF is ready
        const win = window.open('', '_blank');
        if (!win) {
            addNotification('Popup blocked! Allow popups for this site to print.', 'error');
            return;
        }
        win.document.write(`<p style="font-family:sans-serif;padding:24px">Preparing ${name} for printing...</p>`);
        setPreparing(which);
        try {
            if (!packRef.current) packRef.current = buildPack();
            const pack = await packRef.current;
            setPrintedDocs(pack.docs);
            setEmptyPacks([...(pack.labelUrl ? [] : ['label' as PackKind]), ...(pack.a4Url ? [] : ['a4' as PackKind])]);
            const url = which === 'label' ? pack.labelUrl : pack.a4Url;
            if (!url) {
                win.close();
                addNotification(`No ${name} were found for this order.`, 'warning');
                return;
            }
            win.location.href = url;
            const failed = pack.docs.filter(d => d.error).length;
            addNotification(
                failed ? `Opened the ${name}. ${failed} document(s) could not be included.` : `${which === 'label' ? '4x6 labels' : 'A4 documents'} opened. Press Ctrl+P and pick the ${which === 'label' ? 'label' : 'A4'} printer.`,
                failed ? 'warning' : 'success'
            );
        } catch (e: any) {
            packRef.current = null; // let the next click try again
            win.close();
            addNotification(e.message || 'Could not prepare the documents.', 'error');
        } finally {
            setPreparing(null);
        }
    };

    const feedbackClass = feedback?.tone === 'ok' ? 'bg-green-50 text-green-800 border-green-200'
        : feedback?.tone === 'dup' ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-red-50 text-red-800 border-red-200';

    const packLabel = (packs?: PackKind[]) => (packs || []).map(p => p === 'label' ? '4x6' : 'A4').join(' + ');

    const printButton = (which: PackKind, text: string, title: string, primary: boolean) => (
        <button
            onClick={() => handlePrint(which)}
            disabled={!isComplete || preparing !== null || emptyPacks.includes(which)}
            title={!isComplete ? 'Scan every box first' : emptyPacks.includes(which) ? 'Nothing of this size for this order' : title}
            className={`px-6 py-2.5 font-bold rounded-xl transition-all flex items-center gap-2 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${primary ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700' : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'}`}
        >
            {preparing === which ? <RefreshIcon className="h-5 w-5 animate-spin" /> : <PrinterIcon className="h-5 w-5" />}
            {preparing === which ? 'Preparing...' : text}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[120] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-partners-green text-white rounded-lg"><CubeIcon className="h-6 w-6" /></div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Scan Boxes to Print</h3>
                            <p className="text-xs text-gray-500">
                                Order <span className="font-bold text-partners-green">{so.id}</span>
                                {scanStatus?.awb ? <> · AWB <span className="font-mono font-bold text-gray-700">{scanStatus.awb}</span></> : null}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><XCircleIcon className="h-6 w-6 text-gray-400" /></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-5">
                    {loadError ? (
                        <div className="flex flex-col items-center text-center py-10">
                            <AlertIcon className="h-10 w-10 text-red-500 mb-3" />
                            <p className="font-bold text-gray-800">{loadError}</p>
                            <button onClick={load} className="mt-4 px-4 py-2 text-xs font-bold rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center gap-1.5"><RefreshIcon className="h-3.5 w-3.5" /> Try again</button>
                        </div>
                    ) : !scanStatus ? (
                        <div className="flex justify-center py-10"><LoadingCube label="Loading boxes..." /></div>
                    ) : expectedCount === 0 ? (
                        <div className="flex flex-col items-center text-center py-10">
                            <AlertIcon className="h-10 w-10 text-amber-500 mb-3" />
                            <p className="font-bold text-gray-800">No box data for this order</p>
                            <p className="text-sm text-gray-500 max-w-sm mt-2">No rows for "{so.id}" in Master_Packing_Data, so there is nothing to scan against. Upload the box data, then open this again.</p>
                        </div>
                    ) : (
                        <>
                            {showAbandoned && (
                                <div className="px-4 py-3 rounded-xl border bg-amber-50 text-amber-800 border-amber-200 text-sm">
                                    <p className="font-bold">Scanning was left unfinished last time ({scanStatus.abandonedCount} of {expectedCount} boxes).</p>
                                    <p className="text-xs mt-0.5">Those scans don't count. Scan every box again.</p>
                                </div>
                            )}

                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Boxes scanned</p>
                                    <p className={`text-2xl font-black ${isComplete ? 'text-partners-green' : 'text-gray-800'}`}>{scannedCount} / {expectedCount}</p>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-partners-green transition-all" style={{ width: `${(scannedCount / expectedCount) * 100}%` }} />
                                </div>
                            </div>

                            {!isComplete && (
                                <form onSubmit={(e) => { e.preventDefault(); submitScan(input); }}>
                                    <input
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onBlur={() => setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) inputRef.current?.focus(); }, 0)}
                                        placeholder="Scan the barcode on each box"
                                        className="w-full px-4 py-3 text-lg font-mono border-2 border-partners-green/40 rounded-xl focus:ring-2 focus:ring-partners-green focus:border-partners-green outline-none"
                                        autoComplete="off"
                                        autoFocus
                                    />
                                </form>
                            )}

                            {feedback && (
                                <div className={`px-4 py-3 rounded-xl border text-sm font-bold ${feedbackClass}`}>{feedback.text}</div>
                            )}

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {Array.from({ length: expectedCount }, (_, i) => {
                                    const tile = tiles[i];
                                    return (
                                        <div key={i} className={`p-3 rounded-xl border ${tile ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`} title={tile?.by ? `${tile.by}, ${tile.at}` : undefined}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase">Box {i + 1}</span>
                                                {tile ? <CheckCircleIcon className="h-4 w-4 text-partners-green" /> : <span className="h-4 w-4 rounded-full border-2 border-gray-300" />}
                                            </div>
                                            {tile ? (
                                                <>
                                                    <p className="font-mono font-bold text-green-800">{tile.boxId}</p>
                                                    <p className="text-[9px] text-gray-400 truncate">{tile.saving ? 'Saving...' : tile.by}</p>
                                                </>
                                            ) : (
                                                <p className="text-xs font-bold text-gray-400 py-1">Not scanned</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {printedDocs && (
                                <div className="border rounded-xl divide-y">
                                    {printedDocs.length === 0 && <p className="p-3 text-xs text-gray-500">No label, invoice, docket or PO is saved on this order.</p>}
                                    {printedDocs.map(d => (
                                        <div key={d.url} className="p-3 flex items-center justify-between gap-3 text-xs">
                                            <span className="font-bold text-gray-700">{d.label}</span>
                                            {d.error ? (
                                                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-red-600 font-bold flex items-center gap-1 hover:underline" title={d.error}>
                                                    Not included, open it <ExternalLinkIcon className="h-3 w-3" />
                                                </a>
                                            ) : <span className="text-partners-green font-bold">In {packLabel(d.packs)}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="p-6 bg-gray-50 border-t flex flex-wrap justify-end gap-3">
                    {isComplete && extraPrints.map(p => (
                        <button key={p.label} onClick={p.onClick} className="px-4 py-2.5 text-sm font-bold text-partners-green bg-white border border-partners-green/30 rounded-xl hover:bg-partners-green/10 flex items-center gap-2">
                            <PrinterIcon className="h-4 w-4" /> {p.label}
                        </button>
                    ))}
                    {printButton('a4', 'Print A4 Documents', 'Invoice, PO and docket on A4', false)}
                    {printButton('label', 'Print 4x6 Labels', 'Shipping label, sized for the 4x6 label printer', true)}
                </div>
            </div>
        </div>
    );
};

export default BoxScanPrintModal;
