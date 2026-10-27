import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    RefreshIcon, XCircleIcon, CheckCircleIcon, TruckIcon, CalendarIcon, SearchIcon, UploadIcon,
    ExternalLinkIcon, LogoutIcon, CubeIcon, XIcon, AlertIcon, LockClosedIcon
} from './icons/Icons';

// Self-ship partner portal, served at /partner. Shows the self-ship requests from Urvi
// Ent's tracker sheet; the partner books each one with a courier, then submits:
//   Delhivery: the LRN and the label PDF
//   Scorpion:  the docket number, the box label PDF and the docket PDF
//   Bluedart:  the AWB and a photo of the handwritten waybill
// The server reads the documents and only accepts them when the number, box count and
// PO / invoice all match the request (see server/routes/partner.ts). Bluedart waybills are
// read with OCR, which reliably reads only the printed AWB.

interface PartnerUser {
    email: string;
    name: string;
    internal: boolean;
}

interface ShipRequest {
    row: number;
    invoiceNumber: string;
    status: string;
    poNumbers: string[];
    channel: string;
    eeReference: string;
    boxes: number;
    bookedDate: string;
    appointmentDate: string;
    appointmentTime: string;
    appointmentId: string;
    shipTo: string;
    boxDetails: string;
    invoiceValue: number;
    ewb: string;
    awb: string;
    poPdfUrl: string;
    invoiceUrl: string;
    labelUrl: string;
    docketUrl: string;
    courier: string;
    trackingUrl: string;
    verification: string;
    submittedBy: string;
    submittedAt: string;
}

interface Check {
    key: string;
    label: string;
    ok: boolean;
    blocking: boolean;
    detail: string;
}

type Tab = 'Pending' | 'Completed' | 'All';

type CourierKey = 'delhivery' | 'scorpion' | 'bluedart';

interface CourierOption {
    key: CourierKey;
    label: string;
    numberName: string;
    placeholder: string;
    available: boolean;
}

const COURIERS: CourierOption[] = [
    { key: 'delhivery', label: 'Delhivery', numberName: 'LRN', placeholder: 'e.g. 320862936', available: true },
    { key: 'scorpion', label: 'Scorpion', numberName: 'Docket number', placeholder: 'e.g. 11000011425', available: true },
    { key: 'bluedart', label: 'Bluedart', numberName: 'AWB', placeholder: 'e.g. 51984159570', available: true },
];

// Completed rows from before the courier choice have no Courier: they were Delhivery
const courierOf = (r: ShipRequest) => COURIERS.find(c => c.label.toLowerCase() === (r.courier || 'Delhivery').toLowerCase()) || COURIERS[0];

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

// Ops may move a row past "Accepted" in the sheet (e.g. Delivered); all of those are done
const isDone = (r: ShipRequest) => r.status !== 'Pending' && r.status !== 'Cancelled';

const SESSION_KEY = 'cubelelo.partnerPortal.session';

const loadSession = (): { token: string; user: PartnerUser } | null => {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const saveSession = (session: { token: string; user: PartnerUser } | null) => {
    try {
        if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        else localStorage.removeItem(SESSION_KEY);
    } catch {
        // Private mode / blocked storage: the session just won't survive a reload
    }
};

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

// Phone photos are often 3-10 MB and may be HEIC; re-encode as a JPEG of at most 2400 px,
// which stays well under the upload limit and is still sharp enough for OCR
const photoToJpeg = async (file: File): Promise<File> => {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not convert the photo.');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
};

// Whole days from today (IST calendar day) to a yyyy-MM-dd date; null if no date
const daysUntil = (date: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    return Math.round((new Date(date).getTime() - today.getTime()) / 86_400_000);
};

const formatDate = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return date || '—';
    return new Date(date.slice(0, 10)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const AppointmentBadge: React.FC<{ date: string }> = ({ date }) => {
    const days = daysUntil(date);
    if (days === null) return <span className="text-xs font-bold text-gray-400">No appointment</span>;
    const [text, tone] =
        days < 0 ? [`${-days}d overdue`, 'bg-red-100 text-red-700'] :
        days === 0 ? ['Today', 'bg-red-100 text-red-700'] :
        days === 1 ? ['Tomorrow', 'bg-amber-100 text-amber-800'] :
        days <= 3 ? [`In ${days} days`, 'bg-amber-50 text-amber-700'] :
        [`In ${days} days`, 'bg-gray-100 text-gray-600'];
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide ${tone}`}>{text}</span>;
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
    const tone = status === 'Pending' ? 'bg-blue-100 text-blue-700'
        : status === 'Cancelled' ? 'bg-gray-100 text-gray-600'
        : 'bg-green-100 text-green-700';
    return <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide ${tone}`}>{status === 'Accepted' ? 'Completed' : status}</span>;
};

const DocLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) =>
    href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:border-partners-green hover:text-partners-green transition-colors">
            {children}<ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
    ) : null;

const ChecksList: React.FC<{ checks: Check[] }> = ({ checks }) => (
    <ul className="space-y-2">
        {checks.map(c => (
            <li key={c.key} className={`flex items-start gap-2.5 p-2.5 rounded-xl text-sm ${c.ok ? 'bg-green-50' : c.blocking ? 'bg-red-50' : 'bg-amber-50'}`}>
                {c.ok
                    ? <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
                    : c.blocking ? <XCircleIcon className="h-5 w-5 text-red-600 flex-shrink-0" />
                    : <AlertIcon className="h-5 w-5 text-amber-600 flex-shrink-0" />}
                <div>
                    <div className="font-bold text-gray-800">{c.label}</div>
                    <div className="text-gray-600 text-xs mt-0.5">{c.detail}</div>
                </div>
            </li>
        ))}
    </ul>
);

const LoginScreen: React.FC<{ onLogin: (token: string, user: PartnerUser) => void }> = ({ onLogin }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type === 'PARTNER_AUTH_SUCCESS') {
                setIsLoading(false);
                onLogin(event.data.token, event.data.user);
            } else if (event.data?.type === 'PARTNER_AUTH_ERROR') {
                setIsLoading(false);
                setError(event.data.message || 'Sign-in failed.');
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onLogin]);

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/partner/auth/url');
            const { url } = await res.json();
            const popup = window.open(url, 'partner_google_auth', 'width=520,height=680');
            if (!popup) {
                setIsLoading(false);
                setError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
            }
        } catch {
            setIsLoading(false);
            setError('Could not start sign-in. Check your connection and try again.');
        }
    };

    return (
        <div className="min-h-screen bg-partners-gray-bg flex items-center justify-center p-4 font-sans">
            <div className="max-w-md w-full">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-partners-green rounded-[2rem] text-white shadow-xl border-4 border-white mb-5">
                        <TruckIcon className="h-10 w-10" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Cubelelo Shipping Partner Portal</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px] mt-2">Self-ship requests</p>
                </div>
                <div className="bg-white rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] border border-gray-100 p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl"><LockClosedIcon className="h-5 w-5" /></div>
                        <h2 className="text-lg font-bold text-gray-800">Authorised users only</h2>
                    </div>
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-sm flex items-start gap-3">
                            <XCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}
                    <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                        Sign in with the Google account Cubelelo added to the portal access list.
                    </p>
                    <button onClick={handleGoogleLogin} disabled={isLoading}
                        className="w-full py-3.5 bg-white border-2 border-gray-100 text-gray-700 rounded-full font-bold text-sm shadow-sm hover:border-partners-green hover:text-partners-green transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                        {isLoading ? <RefreshIcon className="h-5 w-5 animate-spin" /> : (
                            <svg className="h-5 w-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                        )}
                        {isLoading ? 'Waiting for Google…' : 'Sign in with Google'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const FilePicker: React.FC<{ label: string; prompt: string; file: File | null; disabled: boolean; accept?: string; onChange: (f: File | null) => void }> =
    ({ label, prompt, file, disabled, accept = 'application/pdf,.pdf', onChange }) => (
        <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-gray-500">{label}</span>
            <div className={`mt-1.5 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed ${file ? 'border-partners-green bg-partners-light-green' : 'border-gray-200'} cursor-pointer`}>
                <UploadIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <span className="text-sm text-gray-700 truncate">{file ? file.name : prompt}</span>
                <input type="file" accept={accept} className="hidden" disabled={disabled}
                    onChange={e => onChange(e.target.files?.[0] || null)} />
            </div>
        </label>
    );

const SubmitModal: React.FC<{
    request: ShipRequest;
    token: string;
    onClose: () => void;
    onAccepted: () => void;
    onSessionExpired: () => void;
}> = ({ request, token, onClose, onAccepted, onSessionExpired }) => {
    const [courier, setCourier] = useState<CourierOption | null>(null);
    const [lrn, setLrn] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [docketFile, setDocketFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ status: string; message: string; checks?: Check[] } | null>(null);

    const accepted = result?.status === 'success';
    const isScorpion = courier?.key === 'scorpion';
    const isBluedart = courier?.key === 'bluedart';
    const lrnClean = lrn.replace(/\s+/g, '');
    const canSubmit = !!courier && /^\d{6,20}$/.test(lrnClean) && !!file && (!isScorpion || !!docketFile) && !isSubmitting && !accepted;

    const chooseCourier = (c: CourierOption | null) => {
        setCourier(c);
        setLrn('');
        setFile(null);
        setDocketFile(null);
        setResult(null);
    };

    // Checks one file, and that it fits alongside the other one (the server takes 3 MB in
    // total). A Bluedart waybill may be a photo, which is re-encoded as a JPEG first.
    const pickFile = async (f: File | null, other: File | null, set: (f: File | null) => void) => {
        setResult(null);
        const isPdf = !!f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        if (f && !isPdf && !(isBluedart && f.type.startsWith('image/'))) {
            set(null);
            setResult({ status: 'error', message: isBluedart ? 'Upload the waybill as a photo or PDF.' : 'Upload the document as a PDF file.' });
            return;
        }
        if (f && !isPdf) {
            try {
                f = await photoToJpeg(f);
            } catch {
                set(null);
                setResult({ status: 'error', message: 'Could not open this photo. Upload it as a JPG or PNG.' });
                return;
            }
        }
        if (f && f.size + (other?.size || 0) > MAX_UPLOAD_BYTES) {
            set(null);
            setResult({ status: 'error', message: 'The files are too large (max 3 MB in total).' });
            return;
        }
        set(f);
    };

    const handleSubmit = async () => {
        if (!courier || !file) return;
        setIsSubmitting(true);
        setResult(null);
        try {
            const res = await fetch('/api/partner/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    invoiceNumber: request.invoiceNumber,
                    courier: courier.key,
                    lrn: lrnClean,
                    labelBase64: await fileToBase64(file),
                    ...(isScorpion && docketFile ? { docketBase64: await fileToBase64(docketFile) } : {}),
                }),
            });
            if (res.status === 401) return onSessionExpired();
            const data = await res.json().catch(() => ({ status: 'error', message: `Server error (${res.status}). Please try again.` }));
            setResult(data);
            if (data.status === 'success') onAccepted();
        } catch {
            setResult({ status: 'error', message: 'Could not reach the server. Check your connection and submit again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const orderId = request.poNumbers[0] || request.invoiceNumber;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={isSubmitting ? undefined : onClose}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="bg-gray-900 text-white px-6 py-5 rounded-t-3xl flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Submit shipment{courier ? ` · ${courier.label}` : ''}</div>
                        <div className="text-lg font-black mt-1">{request.channel} · {request.poNumbers.join(', ') || request.invoiceNumber}</div>
                        <div className="text-xs text-gray-300 mt-1">Invoice {request.invoiceNumber} · <span className="font-bold text-white">{request.boxes} box(es)</span></div>
                    </div>
                    <button onClick={onClose} disabled={isSubmitting} className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-40" aria-label="Close">
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {!accepted && !courier && (
                        <div className="space-y-3">
                            <div className="text-xs font-black uppercase tracking-wide text-gray-500">Which courier did you book this with?</div>
                            {COURIERS.map(c => (
                                <button key={c.key} onClick={() => chooseCourier(c)} disabled={!c.available}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-100 text-left hover:border-partners-green hover:bg-partners-light-green transition-colors disabled:opacity-50 disabled:hover:border-gray-100 disabled:hover:bg-transparent disabled:cursor-not-allowed">
                                    <span className="flex items-center gap-3">
                                        <TruckIcon className="h-5 w-5 text-gray-500" />
                                        <span className="font-black text-gray-900">{c.label}</span>
                                    </span>
                                    {!c.available && <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Coming soon</span>}
                                </button>
                            ))}
                        </div>
                    )}

                    {!accepted && courier && (
                        <>
                            <div className="flex items-start justify-between gap-3 text-xs text-gray-500 bg-gray-50 rounded-xl p-3 leading-relaxed">
                                <span>
                                    Book this with <b>{courier.label}</b> as <b>one shipment of {request.boxes} box(es)</b> with order ID <b>{orderId}</b>,
                                    then enter the <b>{courier.numberName}</b> and upload {isScorpion
                                        ? <>the <b>box label</b> and the <b>docket</b> PDFs exactly as downloaded from {courier.label}.</>
                                        : isBluedart
                                            ? <>a clear photo of the <b>waybill</b>, with the printed AWB under the barcode readable.</>
                                            : <>the label PDF exactly as downloaded from {courier.label}.</>}
                                </span>
                                <button onClick={() => chooseCourier(null)} disabled={isSubmitting}
                                    className="flex-shrink-0 font-bold text-partners-green hover:underline disabled:opacity-40">Change</button>
                            </div>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-wide text-gray-500">{courier.numberName}</span>
                                <input value={lrn} onChange={e => { setLrn(e.target.value); setResult(null); }} inputMode="numeric"
                                    placeholder={courier.placeholder} disabled={isSubmitting}
                                    className="mt-1.5 w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-partners-green focus:outline-none font-mono text-lg tracking-wider" />
                            </label>
                            {isBluedart ? (
                                <FilePicker label="Waybill photo" prompt="Take or choose a photo of the waybill" accept="image/*,application/pdf,.pdf"
                                    file={file} disabled={isSubmitting} onChange={f => pickFile(f, null, setFile)} />
                            ) : (
                                <FilePicker label={isScorpion ? 'Box label PDF' : 'Label PDF'} prompt={isScorpion ? 'Choose the box label PDF' : 'Choose the label PDF'}
                                    file={file} disabled={isSubmitting} onChange={f => pickFile(f, docketFile, setFile)} />
                            )}
                            {isScorpion && (
                                <FilePicker label="Docket PDF" prompt="Choose the docket (consignment note) PDF"
                                    file={docketFile} disabled={isSubmitting} onChange={f => pickFile(f, file, setDocketFile)} />
                            )}
                        </>
                    )}

                    {result && (
                        <div className={`p-4 rounded-2xl text-sm font-bold ${accepted ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                            {result.message}
                        </div>
                    )}
                    {result?.checks && <ChecksList checks={result.checks} />}

                    {accepted ? (
                        <button onClick={onClose} className="w-full py-3.5 rounded-full bg-gray-900 text-white font-bold text-sm">Done</button>
                    ) : courier && (
                        <button onClick={handleSubmit} disabled={!canSubmit}
                            className="w-full py-3.5 rounded-full bg-partners-green text-white font-bold text-sm shadow-lg shadow-green-500/20 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2">
                            {isSubmitting ? <><RefreshIcon className="h-4 w-4 animate-spin" /> Checking documents…</> : 'Verify & submit'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const RequestCard: React.FC<{ request: ShipRequest; onSubmit: () => void }> = ({ request, onSubmit }) => {
    const pending = request.status === 'Pending';
    const lastFailure = pending && request.verification.startsWith('✗') ? request.verification : '';
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wide text-gray-400">{request.channel}</span>
                        <StatusPill status={request.status} />
                        {pending && <AppointmentBadge date={request.appointmentDate} />}
                    </div>
                    <div className="text-lg font-black text-gray-900 mt-1 break-all">{request.poNumbers.join(', ') || '—'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Invoice <span className="font-bold text-gray-700">{request.invoiceNumber}</span> · Requested {request.bookedDate || '—'}</div>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <CubeIcon className="h-5 w-5 text-gray-500" />
                    <span className="text-xl font-black text-gray-900">{request.boxes || '—'}</span>
                    <span className="text-xs font-bold text-gray-500">box(es)</span>
                </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-1">Ship to</div>
                    <div className="text-gray-700 whitespace-pre-line leading-snug">{request.shipTo || '—'}</div>
                </div>
                <div className="space-y-3">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-1">Appointment</div>
                        <div className="flex items-center gap-1.5 text-gray-700">
                            <CalendarIcon className="h-4 w-4 text-gray-400" />
                            {request.appointmentDate ? `${formatDate(request.appointmentDate)}${request.appointmentTime ? `, ${request.appointmentTime}` : ''}` : '—'}
                        </div>
                        {request.appointmentId && <div className="text-xs text-gray-500 mt-0.5">ID {request.appointmentId}</div>}
                    </div>
                    {request.boxDetails && (
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-400 mb-1">Boxes</div>
                            <div className="text-xs text-gray-600 whitespace-pre-line font-mono">{request.boxDetails}</div>
                        </div>
                    )}
                    {(request.invoiceValue > 0 || request.ewb) && (
                        <div className="text-xs text-gray-600">
                            {request.invoiceValue > 0 && <>Invoice value <b>₹{request.invoiceValue.toLocaleString('en-IN')}</b></>}
                            {request.ewb && <> · EWB <b className="font-mono">{request.ewb}</b></>}
                        </div>
                    )}
                </div>
            </div>

            {!pending && request.awb && (
                <div className="mt-4 p-3 rounded-xl bg-green-50 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-green-800">{courierOf(request).label} {courierOf(request).numberName} <b className="font-mono">{request.awb}</b></span>
                    {request.submittedAt && <span className="text-xs text-green-700">Submitted {request.submittedAt}{request.submittedBy ? ` by ${request.submittedBy}` : ''}</span>}
                </div>
            )}
            {lastFailure && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 text-xs text-red-700 flex items-start gap-2">
                    <XCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span><b>Last attempt rejected:</b> {lastFailure.replace(/^✗\s*/, '')}</span>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
                <DocLink href={request.poPdfUrl}>PO PDF</DocLink>
                <DocLink href={request.invoiceUrl}>Invoice</DocLink>
                <DocLink href={request.labelUrl}>Label</DocLink>
                <DocLink href={request.docketUrl}>{courierOf(request).key === 'bluedart' ? 'Waybill' : 'Docket'}</DocLink>
                <DocLink href={request.trackingUrl}>Track</DocLink>
                {pending && (
                    <button onClick={onSubmit}
                        className="ml-auto px-5 py-2.5 rounded-full bg-partners-green text-white text-sm font-bold shadow-lg shadow-green-500/20 hover:bg-green-600 transition-colors">
                        Submit shipment
                    </button>
                )}
            </div>
        </div>
    );
};

const PartnerPortal: React.FC = () => {
    const [session, setSession] = useState(loadSession);
    const [requests, setRequests] = useState<ShipRequest[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
    const [tab, setTab] = useState<Tab>('Pending');
    const [query, setQuery] = useState('');
    const [submitting, setSubmitting] = useState<ShipRequest | null>(null);

    const signOut = useCallback((message?: string) => {
        saveSession(null);
        setSession(null);
        setRequests([]);
        setError(message || null);
    }, []);

    const handleLogin = useCallback((token: string, user: PartnerUser) => {
        const next = { token, user };
        saveSession(next);
        setSession(next);
        setError(null);
    }, []);

    const loadRequests = useCallback(async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const res = await fetch('/api/partner/requests', { headers: { Authorization: `Bearer ${session.token}` } });
            if (res.status === 401 || res.status === 403) {
                const data = await res.json().catch(() => ({}));
                return signOut(data.message || 'Please sign in again.');
            }
            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.message || 'Could not load requests.');
            setRequests(data.requests || []);
            setLastLoaded(new Date());
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Could not load requests.');
        } finally {
            setIsLoading(false);
        }
    }, [session, signOut]);

    useEffect(() => {
        loadRequests();
        if (!session) return;
        const timer = window.setInterval(loadRequests, 5 * 60 * 1000);
        return () => window.clearInterval(timer);
    }, [loadRequests, session]);

    const counts = useMemo(() => {
        const pending = requests.filter(r => r.status === 'Pending');
        return {
            pending: pending.length,
            dueSoon: pending.filter(r => { const d = daysUntil(r.appointmentDate); return d !== null && d <= 1; }).length,
            completed: requests.filter(isDone).length,
        };
    }, [requests]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return requests
            .filter(r => tab === 'All' || (tab === 'Pending' ? r.status === 'Pending' : isDone(r)))
            .filter(r => !q || [r.invoiceNumber, r.awb, r.channel, r.eeReference, ...r.poNumbers].some(v => v.toLowerCase().includes(q)))
            .sort((a, b) => tab === 'Pending'
                // Most urgent appointment first; requests without one go last
                ? (a.appointmentDate || '9999').localeCompare(b.appointmentDate || '9999') || a.bookedDate.localeCompare(b.bookedDate)
                : (b.submittedAt || b.bookedDate).localeCompare(a.submittedAt || a.bookedDate));
    }, [requests, tab, query]);

    if (!session) return <LoginScreen onLogin={handleLogin} />;

    return (
        <div className="min-h-screen bg-partners-gray-bg font-sans">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 bg-partners-green rounded-2xl text-white flex items-center justify-center flex-shrink-0">
                        <TruckIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="font-black text-gray-900 leading-tight truncate">Cubelelo Shipping Partner Portal</div>
                        <div className="text-[11px] text-gray-500 truncate">
                            {session.user.name}{session.user.internal ? ' · Cubelelo' : ''} · {session.user.email}
                        </div>
                    </div>
                    <button onClick={loadRequests} disabled={isLoading} title="Refresh"
                        className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:text-partners-green hover:border-partners-green disabled:opacity-50">
                        <RefreshIcon className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => signOut()} title="Sign out"
                        className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300">
                        <LogoutIcon className="h-5 w-5" />
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Pending', value: counts.pending, tone: 'text-blue-600' },
                        { label: 'Appointment ≤ 1 day', value: counts.dueSoon, tone: counts.dueSoon ? 'text-red-600' : 'text-gray-900' },
                        { label: 'Completed', value: counts.completed, tone: 'text-green-600' },
                    ].map(t => (
                        <div key={t.label} className="bg-white rounded-2xl border border-gray-100 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">{t.label}</div>
                            <div className={`text-3xl font-black mt-1 ${t.tone}`}>{t.value}</div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex bg-white rounded-xl border border-gray-100 p-1">
                        {(['Pending', 'Completed', 'All'] as Tab[]).map(t => (
                            <button key={t} onClick={() => setTab(t)}
                                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                                {t}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3">
                        <SearchIcon className="h-4 w-4 text-gray-400" />
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search PO, invoice, LRN or docket"
                            className="flex-1 py-2.5 text-sm bg-transparent focus:outline-none" />
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-sm flex items-start gap-3">
                        <XCircleIcon className="h-5 w-5 flex-shrink-0" /><span>{error}</span>
                    </div>
                )}

                {isLoading && !requests.length ? (
                    <div className="py-20 flex justify-center"><RefreshIcon className="h-8 w-8 text-partners-green animate-spin" /></div>
                ) : visible.length ? (
                    <div className="space-y-3">
                        {visible.map(r => <RequestCard key={`${r.row}-${r.invoiceNumber}`} request={r} onSubmit={() => setSubmitting(r)} />)}
                    </div>
                ) : (
                    <div className="py-16 text-center text-gray-400 text-sm font-bold">
                        {tab === 'Pending' && !query ? 'No pending requests. You are all caught up.' : 'Nothing matches.'}
                    </div>
                )}

                {lastLoaded && (
                    <p className="text-center text-[11px] text-gray-400">
                        Updated {lastLoaded.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · refreshes every 5 minutes
                    </p>
                )}
            </main>

            {submitting && (
                <SubmitModal
                    request={submitting}
                    token={session.token}
                    onClose={() => setSubmitting(null)}
                    onAccepted={loadRequests}
                    onSessionExpired={() => { setSubmitting(null); signOut('Your session has expired. Please sign in again.'); }}
                />
            )}
        </div>
    );
};

export default PartnerPortal;
