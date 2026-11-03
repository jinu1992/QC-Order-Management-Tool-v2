import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { type GroupedSalesOrder } from '../types';
import { getBoxScanStatus, recordBoxScan, getPrintPack, type BoxScanStatus, type PrintPackDocument } from '../services/api';
import { PrinterIcon, XCircleIcon, CheckCircleIcon, AlertIcon, CubeIcon, RefreshIcon, ExternalLinkIcon } from './icons/Icons';
import LoadingCube from './LoadingCube';

// Before a shipment's documents print, every box's EasyEcom Box ID barcode is scanned.
// Scans are saved per order + AWB on the Box_Scan_Log sheet; once all boxes are in,
// "Print All" merges the label, invoice(s), docket and PO into one PDF.

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

// Same normalisation as the backend's normalizeBoxId_
const normalizeBoxId = (v: string) => String(v || '').trim().replace(/^[`']/, '').replace(/\.0+$/, '').toUpperCase();

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

const BoxScanPrintModal: FC<Props> = ({ so, userName, onClose, addNotification, extraPrints = [] }) => {
    const [scanStatus, setScanStatus] = useState<BoxScanStatus | null>(null);
    const [loadError, setLoadError] = useState('');
    const [input, setInput] = useState('');
    const [pending, setPending] = useState<string[]>([]);
    const [feedback, setFeedback] = useState<Feedback>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [printedDocs, setPrintedDocs] = useState<PrintPackDocument[] | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const queueRef = useRef<Promise<void>>(Promise.resolve());

    const load = async () => {
        setLoadError('');
        try {
            const res = await getBoxScanStatus(so.id);
            if (res.status !== 'success') throw new Error(res.message || 'Could not load the box list.');
            setScanStatus(res);
        } catch (e: any) {
            setLoadError(e.message || 'Could not load the box list.');
        }
    };

    useEffect(() => { load(); }, [so.id]);
    useEffect(() => { if (scanStatus) inputRef.current?.focus(); }, [scanStatus]);

    const expected = scanStatus?.expectedBoxIds || [];
    const scannedById = useMemo(() => {
        const map: Record<string, { scannedBy: string; scannedAt: string } | null> = {};
        (scanStatus?.scans || []).forEach(s => { map[s.boxId] = s; });
        pending.forEach(b => { if (!(b in map)) map[b] = null; });
        return map;
    }, [scanStatus, pending]);
    const scannedCount = expected.filter(b => b in scannedById).length;
    const isComplete = !!scanStatus?.complete && pending.length === 0;

    const submitScan = (raw: string) => {
        const boxId = normalizeBoxId(raw);
        setInput('');
        inputRef.current?.focus();
        if (!boxId || !scanStatus) return;

        if (boxId in scannedById) {
            beep(false);
            setFeedback({ tone: 'dup', text: `Box ${boxId} is already scanned.` });
            return;
        }
        const belongsHere = expected.includes(boxId);
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
                const res = await recordBoxScan(so.id, boxId, userName);
                if (res.status === 'success') {
                    setScanStatus(res);
                } else {
                    if (belongsHere) beep(false);
                    setFeedback({ tone: 'error', text: res.message || `Box ${boxId} was not saved. Scan it again.` });
                }
            } catch (e: any) {
                if (belongsHere) beep(false);
                setFeedback({ tone: 'error', text: `Box ${boxId} was not saved (${e.message}). Scan it again.` });
            } finally {
                setPending(p => p.filter(b => b !== boxId));
            }
        });
    };

    const handlePrintAll = async () => {
        // Opened inside the click so the popup blocker allows it; filled once the PDF is ready
        const win = window.open('', '_blank');
        if (!win) {
            addNotification('Popup blocked! Allow popups for this site to print.', 'error');
            return;
        }
        win.document.write('<p style="font-family:sans-serif;padding:24px">Preparing documents for printing...</p>');
        setIsPrinting(true);
        setPrintedDocs(null);
        try {
            const res = await getPrintPack(so.id);
            if (res.status !== 'success') throw new Error(res.message || 'Could not collect the documents.');
            const docs = res.documents || [];

            const { PDFDocument } = await import('pdf-lib');
            const merged = await PDFDocument.create();
            const results: PrintPackDocument[] = [];
            for (const doc of docs) {
                if (!doc.base64) { results.push(doc); continue; }
                try {
                    const bytes = base64ToBytes(doc.base64);
                    if (doc.mimeType === 'application/pdf') {
                        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
                        const pages = await merged.copyPages(src, src.getPageIndices());
                        pages.forEach(p => merged.addPage(p));
                    } else {
                        const img = doc.mimeType === 'image/png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
                        const scale = Math.min(1, 842 / Math.max(img.width, img.height));
                        const page = merged.addPage([img.width * scale, img.height * scale]);
                        page.drawImage(img, { x: 0, y: 0, width: img.width * scale, height: img.height * scale });
                    }
                    results.push({ ...doc, base64: undefined });
                } catch (e: any) {
                    results.push({ ...doc, base64: undefined, error: `Could not read the file (${e.message})` });
                }
            }
            setPrintedDocs(results);

            if (merged.getPageCount() === 0) {
                win.close();
                addNotification('No printable documents were found for this order.', 'warning');
                return;
            }
            const blob = new Blob([(await merged.save()) as BlobPart], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            win.location.href = url;
            setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
            const failed = results.filter(d => d.error).length;
            addNotification(failed ? `Opened the print pack. ${failed} document(s) could not be included.` : 'Print pack opened. Press Ctrl+P to print.', failed ? 'warning' : 'success');
        } catch (e: any) {
            win.close();
            addNotification(e.message || 'Could not prepare the print pack.', 'error');
        } finally {
            setIsPrinting(false);
        }
    };

    const feedbackClass = feedback?.tone === 'ok' ? 'bg-green-50 text-green-800 border-green-200'
        : feedback?.tone === 'dup' ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-red-50 text-red-800 border-red-200';

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
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><XCircleIcon className="h-6 w-6 text-gray-400" /></button>
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
                    ) : expected.length === 0 ? (
                        <div className="flex flex-col items-center text-center py-10">
                            <AlertIcon className="h-10 w-10 text-amber-500 mb-3" />
                            <p className="font-bold text-gray-800">No box data for this order</p>
                            <p className="text-sm text-gray-500 max-w-sm mt-2">No rows for "{so.id}" in Master_Packing_Data, so there is nothing to scan against. Upload the box data, then open this again.</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Boxes scanned</p>
                                    <p className={`text-2xl font-black ${isComplete ? 'text-partners-green' : 'text-gray-800'}`}>{scannedCount} / {expected.length}</p>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-partners-green transition-all" style={{ width: `${(scannedCount / expected.length) * 100}%` }} />
                                </div>
                            </div>

                            {!isComplete && (
                                <form onSubmit={(e) => { e.preventDefault(); submitScan(input); }}>
                                    <input
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onBlur={() => setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) inputRef.current?.focus(); }, 0)}
                                        placeholder="Scan a box barcode (or type the Box ID and press Enter)"
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
                                {expected.map((boxId, i) => {
                                    const scanned = boxId in scannedById;
                                    const info = scannedById[boxId];
                                    return (
                                        <div key={boxId} className={`p-3 rounded-xl border ${scanned ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`} title={info ? `${info.scannedBy}, ${info.scannedAt}` : undefined}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase">Box {i + 1}</span>
                                                {scanned ? <CheckCircleIcon className="h-4 w-4 text-partners-green" /> : <span className="h-4 w-4 rounded-full border-2 border-gray-300" />}
                                            </div>
                                            <p className={`font-mono font-bold ${scanned ? 'text-green-800' : 'text-gray-500'}`}>{boxId}</p>
                                            {scanned && <p className="text-[9px] text-gray-400 truncate">{info ? info.scannedBy : 'Saving...'}</p>}
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
                                            ) : <span className="text-partners-green font-bold">Included</span>}
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
                    <button
                        onClick={handlePrintAll}
                        disabled={!isComplete || isPrinting}
                        title={isComplete ? 'Label, invoice, docket and PO in one PDF' : 'Scan every box first'}
                        className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {isPrinting ? <RefreshIcon className="h-5 w-5 animate-spin" /> : <PrinterIcon className="h-5 w-5" />}
                        {isPrinting ? 'Preparing...' : 'Print All'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BoxScanPrintModal;
