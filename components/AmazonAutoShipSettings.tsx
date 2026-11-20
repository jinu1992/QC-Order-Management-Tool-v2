import React, { useEffect, useState } from 'react';
import { User } from '../types';
import { fetchAmazonAutoShipSettings, saveAmazonAutoShipSettings, previewAmazonAutoShip, AmazonAutoShipSettings as Settings, AmazonAutoShipOrder } from '../services/api';
import { CubeIcon, RefreshIcon, CheckCircleIcon, AlertIcon, ClockIcon } from './icons/Icons';
import { AMAZON_API_SHIPMENT_ENABLED } from './AmazonShipmentModal';

// Settings → Order Automation: once an Amazon FBA order's box data is complete, the tool creates
// its Amazon shipment and books the earliest ATS pickup by itself, then fetches the box labels and
// delivery challan. Same steps as the Create AMZ Shipment button. The rules and the timer live in
// Apps Script ("amazon fba shipment.js", section 1b); this page switches it on or off and shows
// what it did and would do.

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

const money = (amount: number | null, currency: string) =>
    amount === null || amount === undefined ? '' : `${currency === 'INR' ? '₹' : `${currency} `}${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const AmazonAutoShipSettings: React.FC<Props> = ({ currentUser, addLog, addNotification }) => {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loadError, setLoadError] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState<AmazonAutoShipOrder[] | null>(null);
    const [previewing, setPreviewing] = useState(false);

    const load = async () => {
        setLoadError('');
        try {
            const res = await fetchAmazonAutoShipSettings();
            if (res.status !== 'success') throw new Error(res.message || 'Could not load the settings.');
            setSettings(res);
            setEnabled(res.config.enabled);
        } catch (e: any) {
            setLoadError(e.message || 'Could not load the settings.');
        }
    };

    useEffect(() => { load(); }, []);

    const dirty = !!settings && enabled !== settings.config.enabled;

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await saveAmazonAutoShipSettings({ enabled, userName: currentUser.name });
            if (res.status !== 'success') {
                addNotification(res.message || 'Could not save the settings.', 'error');
                return;
            }
            addNotification(res.message, 'success');
            addLog('Order Automation', `Amazon FBA auto-shipment ${enabled ? 'on' : 'off'}`);
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
            const res = await previewAmazonAutoShip();
            if (res.status !== 'success') throw new Error(res.message || 'Could not check the orders.');
            setPreview(res.orders || []);
        } catch (e: any) {
            addNotification(e.message || 'Could not check the orders.', 'error');
        } finally {
            setPreviewing(false);
        }
    };

    if (!settings) {
        return loadError ? (
            <div className="max-w-3xl p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between gap-4">
                <span>{loadError}</span>
                <button onClick={load} className="px-3 py-1.5 bg-white border border-red-200 rounded-lg font-semibold hover:bg-red-50">Retry</button>
            </div>
        ) : (
            <div className="max-w-3xl py-12 flex flex-col items-center gap-2 text-sm text-gray-500">
                <RefreshIcon className="h-6 w-6 animate-spin text-gray-400" /> Loading…
            </div>
        );
    }

    const { rules, state } = settings;
    const last = state.lastCheck;
    const readyCount = preview?.filter(o => o.ready).length || 0;

    return (
        <div className="space-y-6">
            <div className="max-w-3xl bg-gray-50 p-6 rounded-lg border border-gray-200 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                            <CubeIcon className="h-5 w-5 text-partners-green" /> Amazon FBA shipments and ATS pickup
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">
                            {enabled
                                ? 'On: packed Amazon FBA orders get their shipment and the earliest ATS pickup every 15 minutes, 8 am to 10 pm.'
                                : AMAZON_API_SHIPMENT_ENABLED
                                    ? 'Off: shipments are created with Create AMZ Shipment, and a person picks the pickup slot.'
                                    : 'Off: shipments are made in Seller Central (Send to Amazon) for now.'}
                        </p>
                    </div>
                    <button
                        role="switch"
                        aria-checked={enabled}
                        aria-label="Amazon FBA shipments and ATS pickup"
                        onClick={() => setEnabled(!enabled)}
                        disabled={!AMAZON_API_SHIPMENT_ENABLED && !enabled}
                        className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${enabled ? 'bg-partners-green' : 'bg-gray-300'}`}
                    >
                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {!AMAZON_API_SHIPMENT_ENABLED && (
                    <div className="text-xs p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2">
                        <AlertIcon className="h-4 w-4 flex-shrink-0" />
                        <span>
                            Not available for now. When the ATS pickup is booked through Amazon's API, Amazon never confirms the
                            carrier charges, so the box labels and delivery challan can't be downloaded (case 13510273982 with
                            Seller Support). Create FBA shipments in Seller Central and link the FBA Shipment ID in Box Details:
                            the labels and challan still download automatically.
                        </span>
                    </div>
                )}

                <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-4 leading-relaxed">
                    <p className="font-semibold text-gray-700 mb-1.5">The shipment is created when</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        <li>the order was pushed to Amazon (it has an Inbound Plan ID) and has no FBA Shipment ID yet</li>
                        <li>its box data from EasyEcom holds exactly the order's units, every SKU matched to its Amazon SKU</li>
                    </ul>
                    <p className="font-semibold text-gray-700 mt-3 mb-1.5">Then, by itself</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        <li>all units go to the order's Store Code FC, with each box's size, weight and contents</li>
                        <li>the earliest ATS pickup is booked: <b>Amazon charges its quote</b> to the seller account</li>
                        <li>only then the FBA Shipment ID goes on the order, so the invoice is never made for a shipment without ATS</li>
                        <li>box labels and the delivery challan are fetched for Scan &amp; Print</li>
                    </ul>
                    <p className="font-semibold text-gray-700 mt-3 mb-1.5">It is left to you when</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        <li>the placement was confirmed in Seller Central</li>
                        <li>Amazon offers no ATS pickup once the placement is confirmed: Seller Central can't finish a shipment the app started, so it has to be deleted there and sent again</li>
                        <li>anything fails after Amazon made the FBA Shipment ID (Create AMZ Shipment carries on from there)</li>
                        <li>the EasyEcom order is more than {rules.maxOrderAgeDays} days old, its PO has expired, or it failed {rules.maxFails} times</li>
                    </ul>
                    <p className="mt-3">At most {rules.maxPerRun} orders per run; the rest follow 15 minutes later. Each order gets a "[System]" remark on its timeline with the pickup slot and cost.</p>
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
                        Last check {when(state.lastCheckAt)}: {last?.booked || 0} booked, {last?.stopped?.length || 0} left to you, {last?.failed?.length || 0} failed, {last?.waiting || 0} waiting.
                    </p>
                ) : (
                    <p className="text-sm text-gray-500">No check has run yet. The first one runs within 15 minutes of switching it on (8 am to 10 pm).</p>
                )}
                {!!last?.failed?.length && (
                    <ul className="space-y-1.5">
                        {last.failed.map(f => (
                            <li key={f.ref} className="text-xs p-2.5 rounded-lg bg-red-50 border border-red-100 text-red-700 flex items-start gap-2">
                                <AlertIcon className="h-4 w-4 flex-shrink-0" />
                                <span><b>{f.ref}</b> failed ({f.count} of {rules.maxFails}): {f.message}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {!!state.stopped?.length && (
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Left to you</p>
                        <ul className="space-y-1.5">
                            {state.stopped.map(s => (
                                <li key={`${s.ref}-${s.at}`} className="text-xs p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-800 flex items-start justify-between gap-3">
                                    <span className="flex items-start gap-2 min-w-0">
                                        <AlertIcon className="h-4 w-4 flex-shrink-0" />
                                        <span><b>{s.ref}</b>: {s.message}</span>
                                    </span>
                                    <span className="text-amber-600 whitespace-nowrap">{when(s.at)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {!!state.recent?.length && (
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Recently booked</p>
                        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                            {state.recent.map(s => (
                                <li key={`${s.ref}-${s.at}`} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <CheckCircleIcon className="h-4 w-4 text-green-600 flex-shrink-0" />
                                        <span className="truncate">
                                            <b>{s.ref}</b> · {s.fbaShipmentId}{s.boxes ? ` · ${s.boxes} boxes to ${s.storeCode}` : ''}
                                            {s.pickupStart ? ` · pickup ${when(s.pickupStart)}` : ' · carrier already booked'}
                                            {s.amount !== null ? ` · ${money(s.amount, s.currency)}` : ''}
                                        </span>
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
                        <p className="text-xs text-gray-500 mt-0.5">Amazon FBA orders pushed to Amazon without an FBA Shipment ID, and whether each would get its shipment. Nothing is created or booked from here.</p>
                    </div>
                    <button
                        onClick={handlePreview}
                        disabled={previewing}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                    >
                        <RefreshIcon className={`h-4 w-4 ${previewing ? 'animate-spin' : ''}`} /> {previewing ? 'Checking…' : 'Check'}
                    </button>
                </div>
                {preview && (preview.length ? (
                    <>
                        <p className="text-sm text-gray-600">{readyCount} ready, {preview.length - readyCount} waiting.</p>
                        <div className="overflow-x-auto border border-gray-100 rounded-lg">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Order</th>
                                        <th className="px-3 py-2 text-left">EE order date</th>
                                        <th className="px-3 py-2 text-left">Units</th>
                                        <th className="px-3 py-2 text-left">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {preview.map(o => (
                                        <tr key={o.ref}>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="font-semibold text-gray-800">{o.poNumbers.join(', ') || o.ref}</div>
                                                <div className="text-xs text-gray-500">{o.ref} · {o.storeCode || 'no FC'}</div>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-gray-800">{o.orderDate || '-'}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="text-gray-800">{o.qty}</div>
                                                {!!o.boxes && <div className="text-xs text-gray-500">{o.boxes} {o.boxes === 1 ? 'box' : 'boxes'}</div>}
                                            </td>
                                            <td className="px-3 py-2">
                                                {o.ready ? (
                                                    <span className="text-green-700 font-semibold">
                                                        {enabled && settings.config.enabled
                                                            ? (o.resume ? 'Pickup booked at the next run' : 'Shipment and pickup at the next run')
                                                            : 'Ready (switched off)'}
                                                    </span>
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
                    <p className="text-sm text-gray-500">No Amazon FBA order is waiting for its shipment.</p>
                ))}
            </div>
        </div>
    );
};

export default AmazonAutoShipSettings;
