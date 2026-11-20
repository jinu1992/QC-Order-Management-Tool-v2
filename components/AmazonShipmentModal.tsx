import React, { FC, useEffect, useRef, useState } from 'react';
import { type GroupedSalesOrder } from '../types';
import { createAmazonShipment, confirmAmazonTransport, type AmazonCarrierOption, type AmazonShipmentResult } from '../services/api';
import { XCircleIcon, CheckCircleIcon, AlertIcon, RefreshIcon, TruckIcon, ExternalLinkIcon } from './icons/Icons';

// Creates an Amazon FBA shipment through SP-API instead of Seller Central (amazon fba shipment.js):
// 1. "Create shipment": placement to the order's FC, transportation options, box sizes from the
//    EasyEcom packing data, then the placement is confirmed, which creates the FBA Shipment ID.
// 2. A person picks an ATS pickup slot and books it; Amazon charges the quote shown. Only then
//    does the FBA Shipment ID go on the order (it becomes the invoice number).
// The box labels and delivery challan follow from the backend's 15-minute timer once Amazon has
// confirmed the carrier charges (it refuses them for a while after the booking).
// Step 1 resumes from where it stopped, so opening this again after an error carries on.

interface Props {
    so: GroupedSalesOrder;
    userName: string;
    onClose: () => void;
    onChanged: () => void; // refresh the orders (carrier booked, FBA Shipment ID saved)
    addNotification: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

type Phase = 'intro' | 'preparing' | 'choose' | 'booking' | 'done' | 'error';

const formatWhen = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
};
const formatTime = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
};
const formatMoney = (o: AmazonCarrierOption) =>
    o.amount === null || o.amount === undefined ? 'Quote not given' : `${o.currency === 'INR' || !o.currency ? '₹' : o.currency + ' '}${o.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const AmazonShipmentModal: FC<Props> = ({ so, userName, onClose, onChanged, addNotification }) => {
    const [phase, setPhase] = useState<Phase>('intro');
    const [result, setResult] = useState<AmazonShipmentResult | null>(null);
    const [error, setError] = useState('');
    const [chosen, setChosen] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef<number | null>(null);
    const busy = phase === 'preparing' || phase === 'booking';

    useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

    const startTimer = () => {
        setElapsed(0);
        if (timerRef.current) window.clearInterval(timerRef.current);
        const t0 = Date.now();
        timerRef.current = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    };
    const stopTimer = () => { if (timerRef.current) window.clearInterval(timerRef.current); timerRef.current = null; };

    const prepare = async () => {
        setPhase('preparing');
        setError('');
        startTimer();
        try {
            const res = await createAmazonShipment(so.id, userName);
            setResult(res);
            if (res.status !== 'success') {
                setError(res.message || 'Amazon did not accept the shipment.');
                setPhase('error');
            } else if (res.stage === 'done') {
                setPhase('done');
                onChanged();
            } else {
                setChosen(res.options?.[0]?.transportationOptionId || '');
                setPhase('choose'); // the FBA Shipment ID isn't on the order until the pickup is booked
            }
        } catch (e: any) {
            setError(e.message || 'Could not reach the backend.');
            setPhase('error');
        } finally {
            stopTimer();
        }
    };

    const book = async () => {
        const option = result?.options?.find(o => o.transportationOptionId === chosen);
        if (!option) return;
        setPhase('booking');
        startTimer();
        try {
            const res = await confirmAmazonTransport(so.id, option.transportationOptionId, userName);
            if (res.status !== 'success') {
                setError(res.message || 'Amazon did not book the pickup.');
                setPhase('error');
                return;
            }
            setResult(prev => ({ ...(prev || { status: 'success' }), ...res, options: prev?.options }));
            setPhase('done');
            addNotification(res.message || 'ATS pickup booked.', 'success');
            onChanged();
        } catch (e: any) {
            setError(e.message || 'Could not reach the backend.');
            setPhase('error');
        } finally {
            stopTimer();
        }
    };

    const selected = result?.options?.find(o => o.transportationOptionId === chosen);

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[160] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 bg-[#232F3E] flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#FF9900] rounded-xl flex items-center justify-center text-gray-900"><TruckIcon className="h-6 w-6" /></div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Create Amazon Shipment</h3>
                            <p className="text-xs text-gray-400">
                                Order <span className="font-bold text-[#FF9900]">{so.id}</span> · FC <span className="font-bold text-white">{so.storeCode}</span>
                                {(result?.fbaShipmentId || so.fbaShipmentId) && <> · <span className="font-mono text-white">{result?.fbaShipmentId || so.fbaShipmentId}</span></>}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={busy} className="p-2 hover:bg-white/10 rounded-full disabled:opacity-30" title={busy ? 'Wait for Amazon to answer' : 'Close'}>
                        <XCircleIcon className="h-6 w-6 text-gray-400" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-4 text-sm">
                    {phase === 'intro' && (
                        <>
                            <p className="text-gray-700">This does on Amazon what you do today in Seller Central's Send to Amazon:</p>
                            <ol className="list-decimal pl-5 space-y-1 text-gray-700">
                                <li>Places the inbound plan at <b>{so.storeCode}</b>.</li>
                                <li>Sends the box sizes and weights from EasyEcom ({so.boxCount} boxes).</li>
                                <li>Confirms the placement. This creates the <b>FBA Shipment ID</b> on Amazon. <span className="text-red-600 font-bold">It can't be undone.</span></li>
                                <li>Shows the ATS pickup slots and their charges. Nothing is booked until you pick one.</li>
                                <li>Once the pickup is booked, the FBA Shipment ID goes on the order and the invoice can be made.</li>
                            </ol>
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Once started here, Seller Central can't finish this shipment. If Amazon offers no ATS pickup, the shipment has to be deleted in Seller Central (Delete shipment and charges) and sent again from there.</p>
                            <p className="text-xs text-gray-500">Takes 1 to 3 minutes. If the shipment was already started here, it carries on from there.</p>
                        </>
                    )}

                    {busy && (
                        <div className="flex flex-col items-center text-center py-10">
                            <RefreshIcon className="h-10 w-10 animate-spin text-[#FF9900] mb-4" />
                            <p className="font-bold text-gray-800">{phase === 'preparing' ? 'Creating the shipment on Amazon...' : 'Booking the ATS pickup...'}</p>
                            <p className="text-xs text-gray-500 mt-1">{elapsed}s · keep this window open</p>
                        </div>
                    )}

                    {phase === 'choose' && result && (
                        <>
                            <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800">
                                <p className="font-bold flex items-center gap-1.5"><CheckCircleIcon className="h-4 w-4" /> Shipment {result.fbaShipmentId} created on Amazon.</p>
                                <p className="text-xs mt-0.5">It goes on the order (and the invoice) once the ATS pickup is booked.</p>
                                {result.amazonReferenceId && <p className="text-xs mt-0.5">Amazon reference: {result.amazonReferenceId}</p>}
                            </div>
                            <p className="font-bold text-gray-800">Pick the ATS pickup</p>
                            <div className="space-y-2">
                                {(result.options || []).map(o => (
                                    <label key={o.transportationOptionId} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${chosen === o.transportationOptionId ? 'border-[#FF9900] bg-orange-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                        <input type="radio" name="amz-carrier" checked={chosen === o.transportationOptionId} onChange={() => setChosen(o.transportationOptionId)} />
                                        <div className="flex-1">
                                            <p className="font-bold text-gray-800">
                                                {o.pickupStart ? <>Pickup {formatWhen(o.pickupStart)}{o.pickupEnd ? ` - ${formatTime(o.pickupEnd)}` : ''}</> : 'Pickup date set by Amazon'}
                                            </p>
                                            <p className="text-xs text-gray-500">{o.carrier || 'Amazon partnered carrier'} · {o.shippingMode.replace(/_/g, ' ').toLowerCase()}{o.voidableUntil ? ` · can be cancelled free until ${formatWhen(o.voidableUntil)}` : ''}</p>
                                        </div>
                                        <p className="font-black text-gray-900">{formatMoney(o)}</p>
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {phase === 'done' && (
                        <div className="flex flex-col items-center text-center py-6">
                            <CheckCircleIcon className="h-12 w-12 text-partners-green mb-3" />
                            <p className="font-bold text-gray-800">{result?.message || 'Done.'}</p>
                            <p className="text-xs text-gray-500 mt-2 max-w-md">
                                {result?.amazonDocs?.status === 'Done'
                                    ? 'Box labels and the delivery challan are saved. Print them from Scan & Print once the invoice is made.'
                                    : 'Amazon confirms the carrier charges after the booking, so the box labels and the delivery challan download automatically within about half an hour. Scan & Print also fetches them when you open it.'}
                            </p>
                        </div>
                    )}

                    {phase === 'error' && (
                        <div className="space-y-3">
                            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800">
                                <p className="font-bold flex items-center gap-1.5"><AlertIcon className="h-4 w-4" /> Amazon stopped the shipment</p>
                                <p className="text-xs mt-1 break-words">{error}</p>
                            </div>
                            <p className="text-xs text-gray-500">Fix what Amazon reports and try again: it carries on from the last step that worked. Without an ATS pickup, delete the shipment in Seller Central (Delete shipment and charges) and send it again from there; Seller Central can't finish a shipment started here.</p>
                        </div>
                    )}

                    {!!result?.steps?.length && phase !== 'intro' && !busy && (
                        <div className="text-xs text-gray-500 border-t pt-3">
                            <p className="font-bold uppercase tracking-widest text-[10px] text-gray-400 mb-1">Done on Amazon this time</p>
                            <ul className="list-disc pl-5 space-y-0.5">{result.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50 border-t flex flex-wrap justify-end gap-3">
                    {so.inboundPlanId && (
                        <a href={`https://sellercentral.amazon.in/fba/sendtoamazon/confirm_shipping_step?wf=${so.inboundPlanId}`} target="_blank" rel="noopener noreferrer"
                            className="mr-auto px-4 py-2.5 text-xs font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1.5">
                            Open in Seller Central <ExternalLinkIcon className="h-3.5 w-3.5" />
                        </a>
                    )}
                    {phase === 'intro' && (
                        <button onClick={prepare} className="px-6 py-2.5 bg-[#FF9900] text-gray-900 font-black rounded-xl hover:bg-[#FF8C00]">Create shipment</button>
                    )}
                    {phase === 'error' && (
                        <button onClick={prepare} className="px-6 py-2.5 bg-[#FF9900] text-gray-900 font-black rounded-xl hover:bg-[#FF8C00] flex items-center gap-2"><RefreshIcon className="h-4 w-4" /> Try again</button>
                    )}
                    {phase === 'choose' && (
                        <button onClick={book} disabled={!selected} className="px-6 py-2.5 bg-[#FF9900] text-gray-900 font-black rounded-xl hover:bg-[#FF8C00] disabled:opacity-40">
                            Book pickup{selected && selected.amount !== null ? ` (${formatMoney(selected)})` : ''}
                        </button>
                    )}
                    {(phase === 'done' || phase === 'choose' || phase === 'error' || phase === 'intro') && (
                        <button onClick={onClose} className="px-6 py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-black">Close</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AmazonShipmentModal;
