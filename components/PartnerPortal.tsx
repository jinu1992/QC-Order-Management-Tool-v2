import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    RefreshIcon, XCircleIcon, CheckCircleIcon, TruckIcon, CalendarIcon, SearchIcon, UploadIcon,
    ExternalLinkIcon, LogoutIcon, CubeIcon, XIcon, AlertIcon, LockClosedIcon, ChevronDownIcon, ChevronUpIcon, FilterIcon, PrinterIcon
} from './icons/Icons';
import AppointmentPass from './AppointmentPass';

// Self-ship partner portal, served at /partner: a shipment tracker for Urvi Ent's requests
// (the Urvi Ent tracker sheet, joined with PO_Database for live appointments, deliveries
// and returns). The partner books each request with a courier, then submits:
//   Delhivery: the LRN and the label PDF
//   Scorpion:  the docket number, the box label PDF and the docket PDF (merged into one
//              label PDF by the server)
//   Bluedart:  the AWB and a photo of the handwritten waybill
// The server reads the documents and only accepts them when the number, box count and
// PO / invoice all match the request (see server/routes/partner.ts). Bluedart waybills are
// read with OCR, which reliably reads only the printed AWB.
// Once shipped, the partner marks each shipment delivered (with the proof of delivery) or
// RTO; returns stay flagged until EasyEcom shows them received at the warehouse.

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
    // From PO_Database (blank until the server sends them)
    storeCode?: string;
    trackingStatus?: string;
    deliveredDate?: string;
    rtoMarkedAt?: string;
    delivered?: boolean;
    rto?: boolean;
    returnReceived?: boolean;
    podUrl?: string;
    pickupDate?: string;
    // false until the warehouse dispatches it (or EasyEcom ships it); null when the order isn't in
    // PO_Database; absent from older backends
    pickedUp?: boolean | null;
    // The order has an appointment pass QR (fetched separately from /api/partner/appointment-qr)
    hasAppointmentQr?: boolean;
}

interface Check {
    key: string;
    label: string;
    ok: boolean;
    blocking: boolean;
    detail: string;
}

type TabKey = 'all' | 'pickup' | 'today' | 'tomorrow' | 'upcoming' | 'noAppt' | 'missed' | 'delivered' | 'rto';

// Each tab's badge counts what needs the partner: shipments to create, appointments,
// PODs to upload, returns not yet received
const TABS: { key: TabKey; label: string; badge: string; tone: string }[] = [
    { key: 'all', label: 'All Shipments', badge: 'to create', tone: 'bg-blue-100 text-blue-700' },
    { key: 'pickup', label: 'Pickup Pending', badge: 'awaiting pickup', tone: 'bg-teal-100 text-teal-700' },
    { key: 'today', label: "Today's Appts", badge: 'today', tone: 'bg-orange-100 text-orange-700' },
    { key: 'tomorrow', label: "Tomorrow's Appts", badge: 'tomorrow', tone: 'bg-sky-100 text-sky-700' },
    { key: 'upcoming', label: 'Upcoming Appts', badge: 'upcoming', tone: 'bg-indigo-100 text-indigo-700' },
    { key: 'noAppt', label: 'Pending Appointment', badge: 'no appointment', tone: 'bg-amber-100 text-amber-800' },
    { key: 'missed', label: 'Missed Deliveries', badge: 'missed', tone: 'bg-red-100 text-red-700' },
    { key: 'delivered', label: 'Delivered', badge: 'POD pending', tone: 'bg-green-100 text-green-700' },
    { key: 'rto', label: 'RTO / Returned', badge: 'not received', tone: 'bg-purple-100 text-purple-700' },
];

// "All Shipments" filter; the tab opens on shipments still to be created
type StageFilter = 'pending' | 'created' | 'delivered' | 'rto' | 'cancelled' | 'any';

const STAGE_FILTERS: { key: StageFilter; label: string }[] = [
    { key: 'pending', label: 'Shipment pending' },
    { key: 'created', label: 'Shipped, not delivered' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'rto', label: 'RTO / Returned' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'any', label: 'All statuses' },
];

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

const isCancelled = (r: ShipRequest) => r.status === 'Cancelled';
// The partner has submitted the shipment. Ops may also move a row on in the sheet.
const isCreated = (r: ShipRequest) => r.status !== 'Pending' && !isCancelled(r);
const isRto = (r: ShipRequest) => !isCancelled(r) && (!!r.rto || r.status === 'RTO');
const isDelivered = (r: ShipRequest) => !isCancelled(r) && !isRto(r) && (!!r.delivered || r.status === 'Delivered');
// Still on its way to the store (or not yet shipped)
const isOpen = (r: ShipRequest) => !isCancelled(r) && !isRto(r) && !isDelivered(r);
// Channels that book a delivery appointment; bulk / event orders never get one. Same list
// as the tool's "Appt. Missing" filter (isApptMissing in SalesOrderTable).
const needsAppointment = (r: ShipRequest) => ['zepto', 'instamart', 'blinkit', 'minute', 'bb', 'rbl'].some(k => (r.channel || '').toLowerCase().includes(k));

const inTab = (r: ShipRequest, tab: TabKey): boolean => {
    const days = daysUntil(r.appointmentDate);
    switch (tab) {
        case 'all': return true;
        case 'pickup': return isCreated(r) && isOpen(r) && r.pickedUp === false;
        case 'today': return isCreated(r) && isOpen(r) && days === 0;
        case 'tomorrow': return isCreated(r) && isOpen(r) && days === 1;
        case 'upcoming': return isCreated(r) && isOpen(r) && days !== null && days > 1;
        case 'noAppt': return isOpen(r) && needsAppointment(r) && days === null;
        case 'missed': return isOpen(r) && days !== null && days < 0;
        case 'delivered': return isDelivered(r);
        case 'rto': return isRto(r);
    }
};

const tabBadgeCount = (tab: TabKey, rows: ShipRequest[]) => rows.filter(r =>
    tab === 'all' ? r.status === 'Pending'
        : tab === 'delivered' ? isDelivered(r) && !r.podUrl
        : tab === 'rto' ? isRto(r) && !r.returnReceived
        : inTab(r, tab)).length;

const inStage = (r: ShipRequest, stage: StageFilter) =>
    stage === 'pending' ? r.status === 'Pending'
        : stage === 'created' ? isCreated(r) && isOpen(r)
        : stage === 'delivered' ? isDelivered(r)
        : stage === 'rto' ? isRto(r)
        : stage === 'cancelled' ? isCancelled(r)
        : true;

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

const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

// Same badges as the tool's Shipment Tracker
const StagePill: React.FC<{ request: ShipRequest }> = ({ request: r }) => {
    const days = daysUntil(r.appointmentDate);
    const badge = 'px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 w-fit whitespace-nowrap';
    if (isCancelled(r)) return <span className={`${badge} bg-gray-100 text-gray-700`}><XCircleIcon className="w-3 h-3" /> Cancelled</span>;
    if (r.status === 'Pending') return <span className={`${badge} bg-blue-100 text-blue-700`}><UploadIcon className="w-3 h-3" /> Shipment Pending</span>;
    if (isRto(r)) return <span className={`${badge} bg-red-100 text-red-700`}><AlertIcon className="w-3 h-3" /> RTO / Returned</span>;
    if (isDelivered(r)) return <span className={`${badge} bg-green-100 text-green-700`}><CheckCircleIcon className="w-3 h-3" /> Delivered</span>;
    if (days !== null && days < 0) return <span className={`${badge} bg-red-100 text-red-700`}><AlertIcon className="w-3 h-3" /> Missed</span>;
    if (r.pickedUp === false) return <span className={`${badge} bg-teal-100 text-teal-700`}><CubeIcon className="w-3 h-3" /> Pickup Pending</span>;
    if (r.appointmentDate) return <span className={`${badge} bg-blue-100 text-blue-700`}><CalendarIcon className="w-3 h-3" /> Appt Confirmed</span>;
    return <span className={`${badge} bg-orange-100 text-orange-700`}><TruckIcon className="w-3 h-3" /> In Transit</span>;
};

type ActionResult = { status: string; message: string; checks?: Check[] };

// POSTs to a partner route. Resolves null when the session has expired (the caller signs out).
const partnerPost = async (path: string, token: string, body: Record<string, unknown>): Promise<ActionResult | null> => {
    try {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
        });
        if (res.status === 401) return null;
        return await res.json().catch(() => ({ status: 'error', message: `Server error (${res.status}). Please try again.` }));
    } catch {
        return { status: 'error', message: 'Could not reach the server. Check your connection and try again.' };
    }
};

const ModalShell: React.FC<{
    eyebrow: string;
    request: ShipRequest;
    busy: boolean;
    onClose: () => void;
    children: React.ReactNode;
}> = ({ eyebrow, request, busy, onClose, children }) => (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={busy ? undefined : onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-bold text-gray-900">{eyebrow}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                        {request.channel} · PO {request.poNumbers.join(', ') || '-'} · Invoice {request.invoiceNumber} · <span className="font-semibold text-gray-700">{request.boxes} box(es)</span>
                        {request.awb && <> · {courierOf(request).label} {request.awb}</>}
                    </p>
                </div>
                <button onClick={onClose} disabled={busy} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40" aria-label="Close">
                    <XIcon className="h-5 w-5" />
                </button>
            </div>
            <div className="p-5 space-y-4">{children}</div>
        </div>
    </div>
);

const ResultBanner: React.FC<{ result: ActionResult | null }> = ({ result }) => result ? (
    <div className={`p-3 rounded-lg border text-sm font-medium ${result.status === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
        {result.message}
    </div>
) : null;

const DocLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) =>
    href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
            {children}<ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
    ) : null;

const ChecksList: React.FC<{ checks: Check[] }> = ({ checks }) => (
    <ul className="space-y-2">
        {checks.map(c => (
            <li key={c.key} className={`flex items-start gap-2.5 p-2.5 rounded-lg text-sm ${c.ok ? 'bg-green-50' : c.blocking ? 'bg-red-50' : 'bg-amber-50'}`}>
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
            <span className="text-xs font-semibold text-gray-600">{label}</span>
            <div className={`mt-1.5 flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed ${file ? 'border-green-400 bg-green-50' : 'border-gray-200'} cursor-pointer`}>
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
    const [result, setResult] = useState<ActionResult | null>(null);

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
            const data = await partnerPost('/api/partner/submit', token, {
                invoiceNumber: request.invoiceNumber,
                courier: courier.key,
                lrn: lrnClean,
                labelBase64: await fileToBase64(file),
                ...(isScorpion && docketFile ? { docketBase64: await fileToBase64(docketFile) } : {}),
            });
            if (!data) return onSessionExpired();
            setResult(data);
            if (data.status === 'success') onAccepted();
        } catch {
            setResult({ status: 'error', message: 'Could not read the files. Choose them again and submit.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const orderId = request.poNumbers[0] || request.invoiceNumber;

    return (
        <ModalShell eyebrow={`Submit shipment${courier ? ` · ${courier.label}` : ''}`} request={request} busy={isSubmitting} onClose={onClose}>
                    {!accepted && !courier && (
                        <div className="space-y-3">
                            <div className="text-xs font-semibold text-gray-600">Which courier did you book this with?</div>
                            {COURIERS.map(c => (
                                <button key={c.key} onClick={() => chooseCourier(c)} disabled={!c.available}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-300 text-left hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:hover:border-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed">
                                    <span className="flex items-center gap-3">
                                        <TruckIcon className="h-5 w-5 text-gray-500" />
                                        <span className="font-semibold text-gray-900">{c.label}</span>
                                    </span>
                                    {!c.available && <span className="text-xs font-medium text-gray-400">Coming soon</span>}
                                </button>
                            ))}
                        </div>
                    )}

                    {!accepted && courier && (
                        <>
                            <div className="flex items-start justify-between gap-3 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 leading-relaxed">
                                <span>
                                    Book this with <b>{courier.label}</b> as <b>one shipment of {request.boxes} box(es)</b> with order ID <b>{orderId}</b>,
                                    then enter the <b>{courier.numberName}</b> and upload {isScorpion
                                        ? <>the <b>box label</b> and the <b>docket</b> PDFs exactly as downloaded from {courier.label}.</>
                                        : isBluedart
                                            ? <>a clear photo of the <b>waybill</b>, with the printed AWB under the barcode readable.</>
                                            : <>the label PDF exactly as downloaded from {courier.label}.</>}
                                </span>
                                <button onClick={() => chooseCourier(null)} disabled={isSubmitting}
                                    className="flex-shrink-0 font-semibold text-indigo-600 hover:underline disabled:opacity-40">Change</button>
                            </div>
                            <label className="block">
                                <span className="text-xs font-semibold text-gray-600">{courier.numberName}</span>
                                <input value={lrn} onChange={e => { setLrn(e.target.value); setResult(null); }} inputMode="numeric"
                                    placeholder={courier.placeholder} disabled={isSubmitting}
                                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm tracking-wider" />
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

                    <ResultBanner result={result} />
                    {result?.checks && <ChecksList checks={result.checks} />}

                    {accepted ? (
                        <button onClick={onClose} className="w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white font-medium text-sm">Done</button>
                    ) : courier && (
                        <button onClick={handleSubmit} disabled={!canSubmit}
                            className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm shadow-sm disabled:opacity-50 flex items-center justify-center gap-2">
                            {isSubmitting ? <><RefreshIcon className="h-4 w-4 animate-spin" /> Checking documents…</> : 'Verify & submit'}
                        </button>
                    )}
        </ModalShell>
    );
};

// Delivery modes: "deliver" marks the shipment delivered (POD optional), "pod" uploads
// the proof of delivery for one already delivered, "rto" marks it returned
type ShipmentAction = 'deliver' | 'pod' | 'rto';

// A POD may be a PDF or a photo; photos are re-encoded as JPEG to stay under the limit
const preparePod = async (f: File): Promise<File> => {
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    if (!isPdf && !f.type.startsWith('image/')) throw new Error('Upload the POD as a PDF or a photo.');
    const out = isPdf ? f : await photoToJpeg(f).catch(() => { throw new Error('Could not open this photo. Upload it as a JPG or PNG.'); });
    if (out.size > MAX_UPLOAD_BYTES) throw new Error('The POD file is too large (max 3 MB).');
    return out;
};

const ShipmentActionModal: React.FC<{
    action: ShipmentAction;
    request: ShipRequest;
    token: string;
    onClose: () => void;
    onDone: () => void;
    onSessionExpired: () => void;
}> = ({ action, request, token, onClose, onDone, onSessionExpired }) => {
    const [deliveredDate, setDeliveredDate] = useState(todayIst);
    const [pod, setPod] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ActionResult | null>(null);
    const done = result?.status === 'success';

    const pickPod = async (f: File | null) => {
        setResult(null);
        if (!f) return setPod(null);
        try {
            setPod(await preparePod(f));
        } catch (e: any) {
            setPod(null);
            setResult({ status: 'error', message: e.message });
        }
    };

    const canSubmit = !busy && !done && (action === 'rto' || (action === 'pod' ? !!pod : !!deliveredDate && deliveredDate <= todayIst()));

    const handleSubmit = async () => {
        setBusy(true);
        setResult(null);
        try {
            const podFields = pod ? { podBase64: await fileToBase64(pod) } : {};
            const data = action === 'rto'
                ? await partnerPost('/api/partner/mark-rto', token, { invoiceNumber: request.invoiceNumber })
                : action === 'pod'
                    ? await partnerPost('/api/partner/pod', token, { invoiceNumber: request.invoiceNumber, ...podFields })
                    : await partnerPost('/api/partner/mark-delivered', token, { invoiceNumber: request.invoiceNumber, deliveredDate, ...podFields });
            if (!data) return onSessionExpired();
            setResult(data);
            if (data.status === 'success') onDone();
        } catch {
            setResult({ status: 'error', message: 'Could not read the POD file. Choose it again.' });
        } finally {
            setBusy(false);
        }
    };

    const eyebrow = action === 'rto' ? 'Mark RTO / returned' : action === 'pod' ? 'Upload proof of delivery' : 'Mark delivered';
    const busyText = action === 'rto' ? 'Saving…' : pod ? 'Uploading…' : 'Saving…';
    const submitText = action === 'rto' ? 'Yes, mark RTO' : action === 'pod' ? 'Upload POD' : 'Mark delivered';

    return (
        <ModalShell eyebrow={eyebrow} request={request} busy={busy} onClose={onClose}>
            {!done && action === 'rto' && (
                <div className="text-sm text-gray-600 bg-purple-50 border border-purple-100 rounded-lg p-3 leading-relaxed">
                    Mark this shipment as <b>not delivered and returning to Cubelelo</b>. It moves to the RTO / Returned tab
                    and stays flagged until the return is received at our warehouse.
                </div>
            )}
            {!done && action === 'deliver' && (
                <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Delivered on</span>
                    <input type="date" value={deliveredDate} max={todayIst()} disabled={busy}
                        onChange={e => { setDeliveredDate(e.target.value); setResult(null); }}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </label>
            )}
            {!done && action !== 'rto' && (
                <FilePicker label={action === 'pod' ? 'Proof of delivery' : 'Proof of delivery (optional, can be added later)'}
                    prompt="Signed delivery copy: photo or PDF" accept="image/*,application/pdf,.pdf"
                    file={pod} disabled={busy} onChange={pickPod} />
            )}

            <ResultBanner result={result} />

            {done ? (
                <button onClick={onClose} className="w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white font-medium text-sm">Done</button>
            ) : (
                <button onClick={handleSubmit} disabled={!canSubmit}
                    className={`w-full py-2.5 rounded-lg text-white font-medium text-sm shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 ${action === 'rto' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'}`}>
                    {busy ? <><RefreshIcon className="h-4 w-4 animate-spin" /> {busyText}</> : submitText}
                </button>
            )}
        </ModalShell>
    );
};


const firstLine = (s: string) => (s || '').split('\n')[0].trim();

type RowAction = 'submit' | 'pass' | ShipmentAction;

// Loads the appointment QR, then shows the same printable pass as the tool's "Print Appt Pass"
const AppointmentPassLoader: React.FC<{ request: ShipRequest; token: string; onClose: () => void; onSessionExpired: () => void }> =
    ({ request: r, token, onClose, onSessionExpired }) => {
        const [qr, setQr] = useState<string | null>(null);
        const [error, setError] = useState<string | null>(null);

        useEffect(() => {
            let cancelled = false;
            fetch(`/api/partner/appointment-qr?invoiceNumber=${encodeURIComponent(r.invoiceNumber)}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(async res => {
                    if (res.status === 401) return onSessionExpired();
                    const data = await res.json().catch(() => ({ status: 'error', message: `Server error (${res.status}).` }));
                    if (cancelled) return;
                    if (data.status === 'success') setQr(`data:${data.mimeType};base64,${data.base64}`);
                    else setError(data.message || 'Could not load the appointment QR.');
                })
                .catch(() => !cancelled && setError('Could not reach the server. Check your connection and try again.'));
            return () => { cancelled = true; };
            // onSessionExpired is a new function on every render; fetch once per request
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [r.invoiceNumber, token]);

        if (qr) {
            return (
                <AppointmentPass
                    appointmentId={r.appointmentId || 'PENDING'}
                    appointmentDate={r.appointmentDate || 'TBD'}
                    appointmentTime={r.appointmentTime}
                    facilityName={`${r.channel} - ${r.storeCode || firstLine(r.shipTo)}`}
                    qrCodeUrl={qr}
                    purchaseManagerName="BRAINLYTIC SOLUTIONS PVT LTD"
                    purchaseManagerPhone="N/A"
                    unloadingSlot="Standard"
                    purchaseOrderId={r.poNumbers.join(', ')}
                    onClose={onClose}
                    addNotification={message => setError(message)}
                />
            );
        }
        return (
            <ModalShell eyebrow="Appointment pass" request={r} busy={false} onClose={onClose}>
                {error ? <ResultBanner result={{ status: 'error', message: error }} /> : (
                    <div className="py-8 flex flex-col items-center gap-2 text-sm text-gray-500">
                        <RefreshIcon className="h-6 w-6 animate-spin text-gray-400" /> Loading appointment QR…
                    </div>
                )}
            </ModalShell>
        );
    };

const smallButton = 'px-2 py-0.5 rounded text-[10px] font-bold transition-colors flex items-center gap-1 w-fit border';

// One shipment, laid out like a row of the tool's Shipment Tracker table
const ShipmentRow: React.FC<{ request: ShipRequest; onAction: (action: RowAction) => void }> = ({ request: r, onAction }) => {
    const [expanded, setExpanded] = useState(false);
    const pending = r.status === 'Pending';
    const lastFailure = pending && r.verification.startsWith('✗') ? r.verification : '';
    const courier = courierOf(r);
    const days = daysUntil(r.appointmentDate);
    const open = isOpen(r);

    let rowClass = 'hover:bg-gray-50 transition-colors border-l-4 border-transparent cursor-pointer';
    if (isCancelled(r)) rowClass = 'bg-gray-50 hover:bg-gray-100 transition-colors border-l-4 border-gray-300 opacity-60 cursor-pointer';
    else if (open && days === 0) rowClass = 'bg-orange-50/60 hover:bg-orange-100 transition-colors border-l-4 border-orange-500 cursor-pointer';
    else if (open && days === 1) rowClass = 'bg-blue-50/60 hover:bg-blue-100 transition-colors border-l-4 border-blue-500 cursor-pointer';
    else if (open && days !== null && days < 0) rowClass = 'bg-red-50 hover:bg-red-100/80 transition-colors border-l-4 border-red-500 cursor-pointer';
    else if (isDelivered(r)) rowClass = 'bg-green-50/30 hover:bg-green-50 transition-colors border-l-4 border-green-400 cursor-pointer';
    else if (isRto(r)) rowClass = 'bg-purple-50/40 hover:bg-purple-50 transition-colors border-l-4 border-purple-400 cursor-pointer';

    const act = (action: RowAction) => (e: React.MouseEvent) => { e.stopPropagation(); onAction(action); };

    return (
        <>
            <tr onClick={() => setExpanded(!expanded)} className={rowClass}>
                {/* Channel & Store */}
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                        {expanded ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
                        <div>
                            <div className="font-semibold text-gray-900">{r.channel || '-'}</div>
                            <div className="text-sm text-gray-500 max-w-[220px] truncate" title={firstLine(r.shipTo)}>
                                {[r.storeCode, firstLine(r.shipTo)].filter(Boolean).join(' - ') || '-'}
                            </div>
                        </div>
                    </div>
                </td>

                {/* PO Details */}
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{r.poNumbers.join(', ') || '-'}</div>
                    <div className="text-xs text-gray-500">Invoice: {r.invoiceNumber}</div>
                    <div className="text-xs text-gray-500">Requested: {formatDate(r.bookedDate)}</div>
                    {lastFailure && <div className="text-xs text-red-500 mt-0.5 flex items-center gap-1"><XCircleIcon className="h-3 w-3" /> Last submission rejected</div>}
                </td>

                {/* Quantities */}
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">Boxes: <span className="font-medium">{r.boxes || '-'}</span></div>
                    {r.invoiceValue > 0 && <div className="text-sm text-gray-500">Value: <span className="font-medium">₹{r.invoiceValue.toLocaleString('en-IN')}</span></div>}
                </td>

                {/* Tracking Details */}
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                        {r.awb ? (
                            <>
                                <div className="text-sm text-gray-900 flex items-center gap-1.5">
                                    <span className="font-semibold">{courier.numberName}:</span>
                                    {r.trackingUrl ? (
                                        <a href={r.trackingUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                            className="text-indigo-600 hover:text-indigo-900 font-medium underline">{r.awb}</a>
                                    ) : <span>{r.awb}</span>}
                                </div>
                                <div className="text-xs text-gray-500"><span className="font-medium">Carrier:</span> {courier.label}</div>
                                {open && r.pickedUp === false && (
                                    <div className="text-xs font-semibold text-teal-700 mt-0.5">Pickup pending{r.pickupDate ? ` · ${formatDate(r.pickupDate)}` : ''}</div>
                                )}
                            </>
                        ) : (
                            <span className="text-sm text-gray-400 italic">{pending ? 'Shipment not created' : 'No AWB'}</span>
                        )}
                    </div>
                </td>

                {/* Status */}
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="mb-1.5 flex flex-col gap-1">
                        <StagePill request={r} />
                        {r.trackingStatus && <span className="text-xs font-semibold text-gray-700 w-40 truncate mt-0.5" title={r.trackingStatus}>Status: {r.trackingStatus}</span>}
                        {isDelivered(r) && r.deliveredDate && <span className="text-xs text-gray-500">Delivered on {formatDate(r.deliveredDate)}</span>}
                        {isDelivered(r) && (r.podUrl ? (
                            <a href={r.podUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                className="text-xs font-semibold text-green-700 hover:underline flex items-center gap-1 w-fit">
                                <CheckCircleIcon className="h-3 w-3" /> Proof of Delivery
                            </a>
                        ) : <span className="text-xs font-semibold text-amber-600">POD not uploaded</span>)}
                        {isRto(r) && (r.returnReceived
                            ? <span className="text-xs font-semibold text-green-700 flex items-center gap-1"><CheckCircleIcon className="h-3 w-3" /> Received at warehouse</span>
                            : <span className="text-xs font-semibold text-red-600 flex items-center gap-1"><AlertIcon className="h-3 w-3" /> Return not received (GRN pending)</span>)}

                        {pending && (
                            <button onClick={act('submit')} className={`mt-1 ${smallButton} bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100`}>
                                <UploadIcon className="h-3 w-3" /> Submit Shipment
                            </button>
                        )}
                        {isCreated(r) && open && (
                            <div className="flex gap-1.5 mt-1">
                                <button onClick={act('deliver')} className={`${smallButton} bg-green-50 text-green-700 border-green-200 hover:bg-green-100`}>
                                    <CheckCircleIcon className="h-3 w-3" /> Mark Delivered
                                </button>
                                <button onClick={act('rto')} className={`${smallButton} bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100`}>
                                    <AlertIcon className="h-3 w-3" /> Mark RTO
                                </button>
                            </div>
                        )}
                        {isDelivered(r) && !r.podUrl && (
                            <button onClick={act('pod')} className={`mt-1 ${smallButton} bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100`}>
                                <UploadIcon className="h-3 w-3" /> Upload POD
                            </button>
                        )}
                    </div>
                </td>

                {/* Appointment */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {open && days === 0 && <div className="text-xs text-orange-600 font-bold mb-1 uppercase tracking-wider animate-pulse">Today</div>}
                    {open && days === 1 && <div className="text-xs text-blue-600 font-bold mb-1 uppercase tracking-wider">Tomorrow</div>}
                    {open && days !== null && days < 0 && <div className="text-xs text-red-600 font-bold mb-1 uppercase tracking-wider">Missed</div>}
                    <div className="font-medium text-gray-900 mt-0.5">
                        {r.appointmentDate ? (
                            <div className="flex flex-col">
                                <span>{formatDate(r.appointmentDate)}</span>
                                <span className="text-xs text-gray-600 font-normal">{r.appointmentTime}</span>
                            </div>
                        ) : (
                            <span className="text-gray-400 italic font-normal">Pending Appt</span>
                        )}
                    </div>
                    {r.appointmentId && (
                        <div className="text-xs text-indigo-600 bg-indigo-50 py-0.5 px-1.5 rounded inline-block font-medium w-fit border border-indigo-100 mt-1.5">
                            ID: {r.appointmentId}
                        </div>
                    )}
                    {r.hasAppointmentQr && !isCancelled(r) && (
                        <button onClick={act('pass')} className={`mt-1.5 ${smallButton} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100`}>
                            <PrinterIcon className="h-3 w-3" /> Print Appt Pass
                        </button>
                    )}
                </td>
            </tr>
            {expanded && (
                <tr className="bg-gray-50/50">
                    <td colSpan={6} className="px-6 py-4">
                        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm grid md:grid-cols-3 gap-4 text-sm">
                            <div>
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Ship To</div>
                                <div className="text-gray-700 whitespace-pre-line">{r.shipTo || '-'}</div>
                            </div>
                            <div className="space-y-2">
                                {r.boxDetails && (
                                    <div>
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Boxes</div>
                                        <div className="text-xs text-gray-600 whitespace-pre-line font-mono">{r.boxDetails}</div>
                                    </div>
                                )}
                                {r.ewb && <div className="text-xs text-gray-600">EWB: <span className="font-mono font-medium">{r.ewb}</span></div>}
                                {r.submittedAt && <div className="text-xs text-gray-500">Submitted {r.submittedAt}{r.submittedBy ? ` by ${r.submittedBy}` : ''}</div>}
                                {lastFailure && (
                                    <div className="p-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
                                        <b>Last submission rejected:</b> {lastFailure.replace(/^✗\s*/, '')}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap content-start gap-2" onClick={e => e.stopPropagation()}>
                                <DocLink href={r.poPdfUrl}>PO PDF</DocLink>
                                <DocLink href={r.invoiceUrl}>Invoice</DocLink>
                                <DocLink href={r.labelUrl}>Label</DocLink>
                                <DocLink href={r.docketUrl}>{courier.key === 'bluedart' ? 'Waybill' : 'Docket'}</DocLink>
                                <DocLink href={r.podUrl || ''}>POD</DocLink>
                                <DocLink href={r.trackingUrl}>Track</DocLink>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

// Tab colours, as in the tool's Shipment Tracker
const TAB_ACTIVE: Record<TabKey, string> = {
    all: 'border-indigo-500 text-indigo-600',
    pickup: 'border-teal-500 text-teal-600',
    today: 'border-orange-500 text-orange-600',
    tomorrow: 'border-blue-500 text-blue-600',
    upcoming: 'border-sky-500 text-sky-600',
    noAppt: 'border-amber-500 text-amber-600',
    missed: 'border-red-500 text-red-600',
    delivered: 'border-green-500 text-green-600',
    rto: 'border-purple-500 text-purple-600',
};

const EMPTY_TEXT: Record<TabKey, string> = {
    all: 'No shipments matching criteria',
    pickup: 'No shipments waiting for pickup',
    today: 'No shipments with an appointment today',
    tomorrow: 'No shipments with an appointment tomorrow',
    upcoming: 'No shipments with later appointments',
    noAppt: 'Every open shipment has an appointment',
    missed: 'No missed deliveries',
    delivered: 'No delivered shipments yet',
    rto: 'No returned shipments',
};

// Appointment date then time; shipments without one go last
const apptKey = (r: ShipRequest) => `${r.appointmentDate || '9999'} ${r.appointmentTime || '99:99'}`;

const sortForTab = (tab: TabKey) => (a: ShipRequest, b: ShipRequest): number => {
    if (tab === 'delivered') {
        // POD still to upload first, then the latest delivery
        return Number(!!a.podUrl) - Number(!!b.podUrl) || (b.deliveredDate || '').localeCompare(a.deliveredDate || '');
    }
    // Earliest pickup first
    if (tab === 'pickup') return (a.pickupDate || '9999').localeCompare(b.pickupDate || '9999') || apptKey(a).localeCompare(apptKey(b));
    if (tab === 'rto') return Number(!!a.returnReceived) - Number(!!b.returnReceived) || b.bookedDate.localeCompare(a.bookedDate);
    return apptKey(a).localeCompare(apptKey(b)) || a.bookedDate.localeCompare(b.bookedDate);
};

const PartnerPortal: React.FC = () => {
    const [session, setSession] = useState(loadSession);
    const [requests, setRequests] = useState<ShipRequest[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
    const [tab, setTab] = useState<TabKey>('all');
    const [stage, setStage] = useState<StageFilter>('pending');
    const [channel, setChannel] = useState('');
    const [query, setQuery] = useState('');
    const [awbQuery, setAwbQuery] = useState('');
    const [active, setActive] = useState<{ action: RowAction; request: ShipRequest } | null>(null);

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
            if (data.status !== 'success') throw new Error(data.message || 'Could not load shipments.');
            setRequests(data.requests || []);
            setLastLoaded(new Date());
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Could not load shipments.');
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

    const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, tabBadgeCount(t.key, requests)])) as Record<TabKey, number>, [requests]);
    const channels = useMemo(() => Array.from(new Set(requests.map(r => r.channel).filter(Boolean))).sort(), [requests]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const awb = awbQuery.trim().toLowerCase();
        // A search on All Shipments looks through every status: the "Shipment pending"
        // default shouldn't hide a PO the partner is looking for
        const searching = !!(q || awb);
        return requests
            .filter(r => inTab(r, tab) && (tab !== 'all' || searching || inStage(r, stage)))
            .filter(r => !channel || r.channel === channel)
            .filter(r => !awb || (r.awb || '').toLowerCase().includes(awb))
            .filter(r => !q || [r.invoiceNumber, r.channel, r.eeReference, r.storeCode || '', firstLine(r.shipTo), r.appointmentId, ...r.poNumbers]
                .some(v => (v || '').toLowerCase().includes(q)))
            .sort(sortForTab(tab));
    }, [requests, tab, stage, channel, query, awbQuery]);

    if (!session) return <LoginScreen onLogin={handleLogin} />;

    const expireSession = () => { setActive(null); signOut('Your session has expired. Please sign in again.'); };

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <header className="flex flex-col md:flex-row justify-between md:items-center bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-40">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Shipment Tracking</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Cubelelo Shipping Partner Portal</p>
                </div>
                <div className="mt-4 md:mt-0 flex items-center gap-2 sm:gap-4">
                    <div className="hidden sm:flex flex-col items-end mr-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Auto-Refresh Active</p>
                        <p className="text-[11px] font-medium text-partners-green flex items-center gap-1">
                            <RefreshIcon className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                            {lastLoaded ? `Synced: ${lastLoaded.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Syncing…'}
                        </p>
                    </div>
                    <div className="hidden md:block text-right">
                        <p className="text-sm font-semibold text-gray-800">{session.user.name || session.user.email}</p>
                        <p className="text-[11px] text-gray-500">{session.user.email}</p>
                    </div>
                    <button onClick={loadRequests} disabled={isLoading} title="Refresh"
                        className="p-2 text-gray-800 hover:text-partners-green hover:bg-gray-100 rounded-full transition-all border border-transparent hover:border-gray-200 active:scale-95 disabled:opacity-50">
                        <RefreshIcon className={`h-6 w-6 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => signOut()}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                        <LogoutIcon className="h-5 w-5" /> Logout
                    </button>
                </div>
            </header>

            {/* Header & Filters */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                <div className="flex space-x-4 mb-4 border-b border-gray-200 pb-2 overflow-x-auto">
                    {TABS.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${tab === t.key ? TAB_ACTIVE[t.key] : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                            {t.label}
                            <span title={`${counts[t.key]} ${t.badge}`} className={`py-0.5 px-2 rounded-full text-xs font-bold ${counts[t.key] ? t.tone : 'bg-gray-100 text-gray-400'}`}>
                                {counts[t.key]}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input type="text" placeholder="Search by PO Number or Store..." value={query} onChange={e => setQuery(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>

                    <div className="relative flex-1 min-w-[150px] max-w-[200px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FilterIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <select value={channel} onChange={e => setChannel(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                            <option value="">All Channels</option>
                            {channels.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input type="text" placeholder="Filter by AWB / LRN / Docket..." value={awbQuery} onChange={e => setAwbQuery(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-blue-50/30" />
                    </div>

                    {tab === 'all' && (
                        <div className="relative flex-1 min-w-[180px] max-w-[240px] flex items-center gap-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <FilterIcon className="h-4 w-4 text-gray-400" />
                            </div>
                            <select value={stage} onChange={e => setStage(e.target.value as StageFilter)} aria-label="Shipment status filter"
                                className={`block w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 ${stage === 'any' ? 'border-gray-300 bg-white' : 'border-indigo-300 bg-indigo-50 text-indigo-700 font-medium'}`}>
                                {STAGE_FILTERS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                            {stage !== 'any' && (
                                <button onClick={() => setStage('any')} title="Remove filter: show all statuses"
                                    className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                                    <XIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Tracking Table */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
                        <XCircleIcon className="h-5 w-5 flex-shrink-0" /><span>{error}</span>
                    </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[140px]">Channel &amp; Store</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px]">PO Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Quantities</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[220px]">Tracking Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[180px]">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[160px]">Appointment</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {isLoading && !requests.length ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <RefreshIcon className="mx-auto h-8 w-8 text-gray-300 animate-spin" />
                                    </td>
                                </tr>
                            ) : visible.length ? (
                                visible.map(r => <ShipmentRow key={`${r.row}-${r.invoiceNumber}`} request={r} onAction={action => setActive({ action, request: r })} />)
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <TruckIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                        <p className="text-lg font-medium">
                                            {tab === 'all' && stage === 'pending' && !query && !awbQuery && !channel ? 'No shipments to create' : EMPTY_TEXT[tab]}
                                        </p>
                                        <p className="text-sm mt-1">Adjust filters or select another tab.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {active?.action === 'submit' && (
                <SubmitModal
                    request={active.request}
                    token={session.token}
                    onClose={() => setActive(null)}
                    onAccepted={loadRequests}
                    onSessionExpired={expireSession}
                />
            )}
            {active?.action === 'pass' && (
                <AppointmentPassLoader request={active.request} token={session.token} onClose={() => setActive(null)} onSessionExpired={expireSession} />
            )}
            {active && active.action !== 'submit' && active.action !== 'pass' && (
                <ShipmentActionModal
                    action={active.action}
                    request={active.request}
                    token={session.token}
                    onClose={() => setActive(null)}
                    onDone={loadRequests}
                    onSessionExpired={expireSession}
                />
            )}
        </div>
    );
};

export default PartnerPortal;
