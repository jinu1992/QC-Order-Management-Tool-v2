import React, { useEffect, useState } from 'react';
import { User } from '../types';
import { fetchAutoShipSettings, saveAutoShipSettings, previewAutoShip, AutoShipSettings as Settings, AutoShipOrder } from '../services/api';
import { TruckIcon, RefreshIcon, CheckCircleIcon, AlertIcon, ClockIcon } from './icons/Icons';

// Settings → Shipping Automation: marketplace orders are sent to the shipping partner by
// themselves once they have an invoice, box details and (where needed) the appointment.
// The rules and the timer live in Apps Script ("auto ship.js"); this page only switches it
// on or off, picks the channels and partner, and shows what it did and would do.

interface Props {
    currentUser: User;
    addLog: (action: string, details: string) => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const when = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const AutoShipSettings: React.FC<Props> = ({ currentUser, addLog, addNotification }) => {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loadError, setLoadError] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [channels, setChannels] = useState<string[]>([]);
    const [partner, setPartner] = useState('');
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState<AutoShipOrder[] | null>(null);
    const [previewing, setPreviewing] = useState(false);

    const load = async () => {
        setLoadError('');
        try {
            const res = await fetchAutoShipSettings();
            if (res.status !== 'success') throw new Error(res.message || 'Could not load the settings.');
            setSettings(res);
            setEnabled(res.config.enabled);
            setChannels(res.config.channels);
            setPartner(res.config.partner);
        } catch (e: any) {
            setLoadError(e.message || 'Could not load the settings.');
        }
    };

    useEffect(() => { load(); }, []);

    const dirty = !!settings && (enabled !== settings.config.enabled || partner !== settings.config.partner ||
        [...channels].sort().join() !== [...settings.config.channels].sort().join());

    const toggleChannel = (key: string) => {
        setChannels(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
        setPreview(null);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await saveAutoShipSettings({ enabled, channels, partner, userName: currentUser.name });
            if (res.status !== 'success') {
                addNotification(res.message || 'Could not save the settings.', 'error');
                return;
            }
            addNotification(res.message, 'success');
            const partnerLabel = settings?.partners.find(p => p.key === partner)?.label || partner;
            addLog('Shipping Automation', `${enabled ? 'On' : 'Off'}: ${channels.join(', ') || 'no channels'} → ${partnerLabel}`);
            await load();
        } catch {
            addNotification('Could not save the settings.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handlePreview = async () => {
        setPreviewing(true);
        try {
            const res = await previewAutoShip(channels);
            if (res.status !== 'success') throw new Error(res.message || 'Could not check the orders.');
            setPreview(res.orders || []);
        } catch (e: any) {
            addNotification(e.message || 'Could not check the orders.', 'error');
        } finally {
            setPreviewing(false);
        }
    };

    if (!settings) {
        return (
            <div className="p-6">
                {loadError ? (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between gap-4">
                        <span>{loadError}</span>
                        <button onClick={load} className="px-3 py-1.5 bg-white border border-red-200 rounded-lg font-semibold hover:bg-red-50">Retry</button>
                    </div>
                ) : (
                    <div className="py-12 flex flex-col items-center gap-2 text-sm text-gray-500">
                        <RefreshIcon className="h-6 w-6 animate-spin text-gray-400" /> Loading…
                    </div>
                )}
            </div>
        );
    }

    const { rules, state } = settings;
    const partnerName = (settings.partners.find(p => p.key === partner)?.label || partner).replace(/\s*\(.*\)$/, '');
    const readyCount = preview?.filter(o => o.ready).length || 0;

    return (
        <div className="p-6 space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-800">Shipping Automation</h3>
                <p className="text-sm text-gray-500">Send marketplace orders to the shipping partner as soon as they are ready, instead of clicking Ship Order.</p>
            </div>

            <div className="max-w-3xl bg-gray-50 p-6 rounded-lg border border-gray-200 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                            <TruckIcon className="h-5 w-5 text-partners-green" /> Auto-send orders for shipping
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">
                            {enabled ? `On: ready orders go to ${partnerName} every 15 minutes, 8 am to 10 pm.` : 'Off: orders are shipped from the Sales Orders page as before.'}
                        </p>
                    </div>
                    <button
                        role="switch"
                        aria-checked={enabled}
                        aria-label="Auto-send orders for shipping"
                        onClick={() => setEnabled(!enabled)}
                        className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors ${enabled ? 'bg-partners-green' : 'bg-gray-300'}`}
                    >
                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Send to</label>
                    <select
                        value={partner}
                        onChange={e => setPartner(e.target.value)}
                        className="mt-1 block w-full max-w-sm rounded-lg border border-gray-300 bg-white text-gray-900 shadow-sm focus:border-partners-green focus:ring-partners-green sm:text-sm py-2.5 px-3"
                    >
                        {settings.partners.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                </div>

                <div>
                    <span className="block text-sm font-medium text-gray-700">Channels</span>
                    <div className="mt-2 grid sm:grid-cols-2 gap-2">
                        {settings.channels.map(c => (
                            <label key={c.key} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${channels.includes(c.key) ? 'border-partners-green bg-white' : 'border-gray-200 bg-white/60 hover:border-gray-300'}`}>
                                <input type="checkbox" checked={channels.includes(c.key)} onChange={() => toggleChannel(c.key)}
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-partners-green focus:ring-partners-green" />
                                <span>
                                    <span className="block text-sm font-semibold text-gray-800">{c.label}</span>
                                    {c.note && <span className="block text-xs text-gray-500 mt-0.5">{c.note}</span>}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-4 leading-relaxed">
                    <p className="font-semibold text-gray-700 mb-1.5">An order is sent when it has</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        <li>an invoice and its box count from EasyEcom, and no carrier yet</li>
                        <li>for Zepto, the ASN (Appointment ID); for Instamart and BB, the appointment; for RBL, a confirmed appointment if one was requested</li>
                    </ul>
                    <p className="font-semibold text-gray-700 mt-3 mb-1.5">It is left to you when</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        <li>its shipment was cancelled in the tool, or it was already sent to {partnerName} once</li>
                        <li>it was invoiced more than {rules.maxInvoiceAgeDays} days ago</li>
                        <li>sending it failed {rules.maxFails} times</li>
                    </ul>
                    <p className="mt-3">At most {rules.maxPerRun} orders go per run; the rest go 15 minutes later. Each one gets a "[System]" remark on its timeline.</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-gray-500">
                        {settings.config.updatedAt ? `Last changed ${when(settings.config.updatedAt)}${settings.config.updatedBy ? ` by ${settings.config.updatedBy}` : ''}` : 'Never changed'}
                    </p>
                    <button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className="px-6 py-2 bg-partners-green text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 shadow-sm active:scale-95 transition-all"
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>

            {/* What it did */}
            <div className="max-w-3xl bg-white p-6 rounded-lg border border-gray-200 space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <h4 className="font-semibold text-gray-700 flex items-center gap-2"><ClockIcon className="h-5 w-5 text-gray-400" /> Activity</h4>
                    <button onClick={load} className="text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1">
                        <RefreshIcon className="h-3.5 w-3.5" /> Refresh
                    </button>
                </div>
                {state.lastCheckAt ? (
                    <p className="text-sm text-gray-600">
                        Last check {when(state.lastCheckAt)}: {state.lastCheck?.sent || 0} sent, {state.lastCheck?.failed?.length || 0} failed, {state.lastCheck?.waiting || 0} waiting.
                    </p>
                ) : (
                    <p className="text-sm text-gray-500">No check has run yet. The first one runs within 15 minutes of switching it on (8 am to 10 pm).</p>
                )}
                {!!state.lastCheck?.failed?.length && (
                    <ul className="space-y-1.5">
                        {state.lastCheck.failed.map(f => (
                            <li key={f.ref} className="text-xs p-2.5 rounded-lg bg-red-50 border border-red-100 text-red-700 flex items-start gap-2">
                                <AlertIcon className="h-4 w-4 flex-shrink-0" />
                                <span><b>{f.channel} {f.ref}</b> failed ({f.count} of {rules.maxFails}): {f.message}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {!!state.recent?.length && (
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Recently sent</p>
                        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                            {state.recent.map(s => (
                                <li key={`${s.ref}-${s.at}`} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <CheckCircleIcon className="h-4 w-4 text-green-600 flex-shrink-0" />
                                        <span className="truncate"><b>{s.channel}</b> {s.ref} · {s.invoiceNumber} → {s.partner}</span>
                                    </span>
                                    <span className="text-xs text-gray-400 whitespace-nowrap">{when(s.at)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* What it would do */}
            <div className="max-w-3xl bg-white p-6 rounded-lg border border-gray-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h4 className="font-semibold text-gray-700">Check orders now</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Invoiced, unshipped orders on the ticked channels, and whether each would be sent. Nothing is sent from here.</p>
                    </div>
                    <button
                        onClick={handlePreview}
                        disabled={previewing || !channels.length}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                    >
                        <RefreshIcon className={`h-4 w-4 ${previewing ? 'animate-spin' : ''}`} /> {previewing ? 'Checking…' : 'Check'}
                    </button>
                </div>
                {preview && (preview.length ? (
                    <>
                        <p className="text-sm text-gray-600">{readyCount} ready to send, {preview.length - readyCount} waiting.</p>
                        <div className="overflow-x-auto border border-gray-100 rounded-lg">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Order</th>
                                        <th className="px-3 py-2 text-left">Invoice</th>
                                        <th className="px-3 py-2 text-left">Boxes</th>
                                        <th className="px-3 py-2 text-left">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {preview.map(o => (
                                        <tr key={o.ref}>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="font-semibold text-gray-800">{o.channel}</div>
                                                <div className="text-xs text-gray-500">{o.poNumbers.join(', ') || o.ref}</div>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="text-gray-800">{o.invoiceNumber}</div>
                                                <div className="text-xs text-gray-500">{o.invoiceDate}</div>
                                            </td>
                                            <td className="px-3 py-2">{o.boxes || '-'}</td>
                                            <td className="px-3 py-2">
                                                {o.ready ? (
                                                    <span className="text-green-700 font-semibold">{enabled && settings.config.enabled ? 'Goes at the next run' : 'Ready (auto-send is off)'}</span>
                                                ) : (
                                                    <span className="text-amber-700">{o.reason}</span>
                                                )}
                                                {o.lastError && <div className="text-xs text-red-600 mt-0.5">Last try failed: {o.lastError}</div>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-gray-500">No invoiced orders are waiting to ship on these channels.</p>
                ))}
            </div>
        </div>
    );
};

export default AutoShipSettings;
