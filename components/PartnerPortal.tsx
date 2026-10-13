import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    RefreshIcon, XCircleIcon, CheckCircleIcon, TruckIcon, CalendarIcon, SearchIcon, UploadIcon,
    ExternalLinkIcon, LogoutIcon, CubeIcon, XIcon, AlertIcon, LockClosedIcon
} from './icons/Icons';

// Delhivery partner portal, served at /partner. Shows the self-ship requests from the
// Delhivery tracker sheet; the partner books each one in Delhivery, then submits the AWB
// and the label PDF. The server reads the label and only accepts it when the AWB, box
// count and PO / invoice all match the request (see server/routes/partner.ts).

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
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px] mt-2">Delhivery B2B self-ship requests</p>
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

const SubmitModal: React.FC<{
    request: ShipRequest;
    token: string;
    onClose: () => void;
    onAccepted: () => void;
    onSessionExpired: () => void;
}> = ({ request, token, onClose, onAccepted, onSessionExpired }) => {
    const [awb, setAwb] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ status: string; message: string; checks?: Check[] } | null>(null);

    const accepted = result?.status === 'success';
    const awbClean = awb.replace(/\s+/g, '');
    const canSubmit = /^\d{8,20}$/.test(awbClean) && !!file && !isSubmitting && !accepted;

    const handleFile = (f: File | null) => {
        setResult(null);
        if (f && f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
            setFile(null);
            setResult({ status: 'error', message: 'Upload the label as a PDF file.' });
            return;
        }
        if (f && f.size > 3 * 1024 * 1024) {
            setFile(null);
            setResult({ status: 'error', message: 'Label PDF is too large (max 3 MB).' });
            return;
        }
        setFile(f);
    };

    const handleSubmit = async () => {
        if (!file) return;
        setIsSubmitting(true);
        setResult(null);
        try {
            const res = await fetch('/api/partner/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ invoiceNumber: request.invoiceNumber, awb: awbClean, labelBase64: await fileToBase64(file) }),
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

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={isSubmitting ? undefined : onClose}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="bg-gray-900 text-white px-6 py-5 rounded-t-3xl flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Submit shipment</div>
                        <div className="text-lg font-black mt-1">{request.channel} · {request.poNumbers.join(', ') || request.invoiceNumber}</div>
                        <div className="text-xs text-gray-300 mt-1">Invoice {request.invoiceNumber} · <span className="font-bold text-white">{request.boxes} box(es)</span></div>
                    </div>
                    <button onClick={onClose} disabled={isSubmitting} className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-40" aria-label="Close">
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {!accepted && (
                        <>
                            <div className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3 leading-relaxed">
                                Book this as <b>one shipment of {request.boxes} box(es)</b> with order ID <b>{request.poNumbers[0] || request.invoiceNumber}</b>,
                                then enter the MAWB and upload the label PDF exactly as downloaded from Delhivery.
                            </div>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-wide text-gray-500">MAWB / AWB number</span>
                                <input value={awb} onChange={e => { setAwb(e.target.value); setResult(null); }} inputMode="numeric"
                                    placeholder="e.g. 52091310352564" disabled={isSubmitting}
                                    className="mt-1.5 w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-partners-green focus:outline-none font-mono text-lg tracking-wider" />
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-wide text-gray-500">Label PDF</span>
                                <div className={`mt-1.5 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed ${file ? 'border-partners-green bg-partners-light-green' : 'border-gray-200'} cursor-pointer`}>
                                    <UploadIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                                    <span className="text-sm text-gray-700 truncate">{file ? file.name : 'Choose the label PDF'}</span>
                                    <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={isSubmitting}
                                        onChange={e => handleFile(e.target.files?.[0] || null)} />
                                </div>
                            </label>
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
                    ) : (
                        <button onClick={handleSubmit} disabled={!canSubmit}
                            className="w-full py-3.5 rounded-full bg-partners-green text-white font-bold text-sm shadow-lg shadow-green-500/20 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2">
                            {isSubmitting ? <><RefreshIcon className="h-4 w-4 animate-spin" /> Checking label…</> : 'Verify & submit'}
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
                    <span className="text-green-800">AWB <b className="font-mono">{request.awb}</b></span>
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
                <DocLink href={request.trackingUrl}>Track</DocLink>
                {pending && (
                    <button onClick={onSubmit}
                        className="ml-auto px-5 py-2.5 rounded-full bg-partners-green text-white text-sm font-bold shadow-lg shadow-green-500/20 hover:bg-green-600 transition-colors">
                        Submit AWB & label
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
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search PO, invoice or AWB"
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
