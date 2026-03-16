import React, { useState, useMemo, useCallback } from 'react';
import { PurchaseOrder, POItem, User } from '../types';
import { TruckIcon, SearchIcon, AlertIcon, CheckCircleIcon, CalendarIcon, FilterIcon, ChatIcon } from './icons/Icons';

interface GroupedSalesOrder {
    id: string; // eeReferenceCode
    poReference: string;
    status: string;
    originalEeStatus: string;
    channel: string;
    storeCode: string;
    orderDate: string;
    poEdd?: string;
    poExpiryDate?: string;
    poPdfUrl?: string;
    qty: number;
    amount: number;
    items: POItem[];
    batchCreatedAt?: string;
    invoiceDate?: string;
    manifestDate?: string;
    invoiceId?: string;
    invoiceStatus?: string;
    invoiceNumber?: string;
    invoiceTotal?: number;
    invoiceUrl?: string;
    invoicePdfUrl?: string;
    carrier?: string;
    awb?: string;
    trackingStatus?: string;
    edd?: string;
    latestStatus?: string;
    latestStatusDate?: string;
    currentLocation?: string;
    trackingUrl?: string;
    deliveredDate?: string;
    rtoStatus?: string;
    rtoAwb?: string;
    boxCount: number;
    appointmentDate?: string;
    appointmentRequestDate?: string;
    appointmentRequestId?: string;
    appointmentRequestTimestamp?: string;
    appointmentId?: string;
    appointmentTime?: string;
    appointmentRemarks?: string;
    qrCodeUrl?: string;
    ewb?: string;
    fbaShipmentId?: string;
    shippingCharge?: number;
    eeCustomerId?: string;
    consignmentQty?: number;
    consignmentProducts?: number;
    consignmentValue?: string;
}

interface ShipmentManagerProps {
    purchaseOrders: PurchaseOrder[];
    currentUser?: User | null;
}

// Helper to safely format dates and suppress the 1899 Excel epoch bug
const formatSafeDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return ''; }
};

const formatSafeTime = (timeStr?: string): string => {
    if (!timeStr) return '';
    // If it looks like an ISO string with 1899, suppress it
    if (timeStr.includes('1899')) return '';
    // If it's already a short time like "10:30 AM", return as-is
    if (/^\d{1,2}:\d{2}/.test(timeStr) && !timeStr.includes('T')) return timeStr;
    try {
        const d = new Date(timeStr);
        if (isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return ''; }
};

const ShipmentManager: React.FC<ShipmentManagerProps> = ({ purchaseOrders, currentUser }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [channelFilter, setChannelFilter] = useState('');
    const [awbSearch, setAwbSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'All' | 'Today' | 'Tomorrow' | 'Missed' | 'RTO'>('All');

    const todayDate = useMemo(() => new Date(), []);
    const tomorrowDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
    }, []);

    const isSameDay = (dateStr: string | undefined, targetDate: Date) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        return d.toDateString() === targetDate.toDateString();
    };

    const isPastDate = (dateStr: string | undefined, compareDate: Date) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const d1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const compare = new Date(compareDate.getFullYear(), compareDate.getMonth(), compareDate.getDate());
        return d1 < compare;
    };

    // 1. Group the raw purchaseOrders to match SalesOrderTable logic
    const allSalesOrders = useMemo(() => {
        const groups: Record<string, GroupedSalesOrder> = {};

        purchaseOrders.forEach(po => {
            (po.items || []).forEach(item => {
                const rawRef = item.eeReferenceCode;
                if (!rawRef || String(rawRef).trim() === "") return;
                const refCode = String(rawRef).trim();

                const effectiveQty = item.shippedQuantity || 0;
                const effectiveLineAmount = effectiveQty * (item.unitCost || 0);

                const eeBoxCount = Number(item.eeBoxCount || 0);
                const carrier = item.carrier || po.carrier;
                const awb = item.awb || po.awb;
                const trackingStatus = item.trackingStatus || po.trackingStatus;
                const trackingUrl = item.trackingUrl || po.trackingUrl;

                const batchDate = item.eeBatchCreatedAt || po.eeBatchCreatedAt;
                const invNum = item.invoiceNumber;
                const hasInvoice = !!invNum && invNum !== 'GENERATING...';

                const isAmazon = po.channel.toLowerCase().includes('amazon');
                const isAmazonFbaYeio = (po.channel.toLowerCase().includes('amazon_fba') || po.channel.toLowerCase().includes('amazon fba')) &&
                    (po.storeCode.toUpperCase() === 'YEIO');
                const statusHasInvoice = hasInvoice || isAmazonFbaYeio;

                const maniDate = item.eeManifestDate || po.eeManifestDate;
                const eeStatus = (item.eeOrderStatus || po.eeOrderStatus || 'Processing').trim();
                const eeStatusLower = eeStatus.toLowerCase();

                const effectiveOrderDate = item.eeOrderDate || po.eeOrderDate || 'N/A';

                let displayStatus = 'Processing';

                const trackingStatusLower = (trackingStatus || '').toLowerCase();
                const isOutOfDelivery = trackingStatusLower === 'out for delivery';
                const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!item.deliveredDate || !!po.deliveredDate);
                const isDeliveredStatus = isActuallyDelivered && !isOutOfDelivery;

                const rtoStatus = item.rtoStatus || po.rtoStatus;
                const isRTOInitiated = eeStatusLower === 'shipped' && rtoStatus;

                if (eeStatusLower === 'returned' || eeStatusLower === 'rto') displayStatus = 'Returned';
                else if (isRTOInitiated) displayStatus = 'RTO Initiated';
                else if (rtoStatus) displayStatus = 'Returned';
                else if (eeStatusLower === 'closed') displayStatus = 'Closed';
                else if (isDeliveredStatus) displayStatus = statusHasInvoice ? 'Delivered' : 'Batch Created';
                else if (eeStatusLower === 'shipped' || maniDate || trackingStatusLower === 'in transit' || isOutOfDelivery || (trackingStatusLower === 'booked' && eeStatusLower !== 'confirmed')) {
                    displayStatus = statusHasInvoice ? (isAmazon ? 'Delivered' : 'Shipped') : 'Batch Created';
                }
                else if (awb) displayStatus = statusHasInvoice ? 'Label Generated' : 'Batch Created';
                else if (statusHasInvoice) displayStatus = isAmazonFbaYeio && (eeStatusLower === 'shipped' || maniDate) ? 'Delivered' : 'Invoiced';
                else if (batchDate || eeStatusLower === 'picking' || eeStatusLower === 'batched') displayStatus = 'Batch Created';
                else if (eeStatusLower === 'confirmed' || eeStatusLower === 'open') displayStatus = 'Confirmed';

                const isZepto = po.channel.toLowerCase().includes('zepto');

                const apptDate = item.appointmentDate || po.appointmentDate;
                const apptId = item.appointmentId || po.appointmentId;
                const apptReqId = item.appointmentRequestId || po.appointmentRequestId;
                const apptReqDate = item.appointmentRequestDate || po.appointmentRequestDate;
                const apptReqTimestamp = item.appointmentRequestTimestamp || po.appointmentRequestTimestamp;

                if (isZepto && !['Returned', 'Shipped', 'Delivered', 'Closed', 'Label Generated'].includes(displayStatus)) {
                    if (apptId) {
                    } else if (apptDate) {
                        displayStatus = 'Create ASN';
                    } else if (apptReqId || apptReqDate) {
                        displayStatus = 'Awaiting Appointment Confirmation';
                    }
                }

                const isInstamart = po.channel.toLowerCase().includes('instamart');
                if (isInstamart && !['Returned', 'Shipped', 'Delivered', 'Closed', 'Label Generated'].includes(displayStatus)) {
                    if (apptId || apptDate) {
                    } else if (apptReqId || apptReqDate) {
                        displayStatus = 'Awaiting Appointment Confirmation';
                    }
                }

                const isBB = po.channel.toLowerCase().includes('bb');
                if (isBB && !['Returned', 'Shipped', 'Delivered', 'Closed', 'Label Generated', 'Label Generated'].includes(displayStatus)) {
                    if (apptId || apptDate) {
                    } else if (apptReqId || apptReqDate) {
                        displayStatus = 'Awaiting Appointment Confirmation';
                    }
                }

                if (!groups[refCode]) {
                    groups[refCode] = {
                        id: refCode,
                        poReference: String(po.id || ''),
                        status: displayStatus,
                        originalEeStatus: eeStatus,
                        channel: po.channel,
                        storeCode: po.storeCode,
                        orderDate: effectiveOrderDate,
                        poEdd: po.poEdd,
                        poExpiryDate: po.poExpiryDate,
                        poPdfUrl: po.poPdfUrl,
                        qty: 0,
                        amount: 0,
                        items: [],
                        batchCreatedAt: batchDate,
                        invoiceDate: item.invoiceDate,
                        manifestDate: maniDate,
                        invoiceId: item.invoiceId,
                        invoiceStatus: item.invoiceStatus,
                        invoiceNumber: invNum,
                        invoiceTotal: item.invoiceTotal,
                        invoiceUrl: item.invoiceUrl,
                        invoicePdfUrl: item.invoicePdfUrl,
                        carrier: carrier,
                        awb: awb,
                        trackingStatus: trackingStatus,
                        trackingUrl: trackingUrl,
                        edd: item.edd || po.edd,
                        latestStatus: item.latestStatus || po.latestStatus,
                        latestStatusDate: item.latestStatusDate || po.latestStatusDate,
                        currentLocation: item.currentLocation || po.currentLocation,
                        deliveredDate: item.deliveredDate || po.deliveredDate,
                        rtoStatus: item.rtoStatus || po.rtoStatus,
                        rtoAwb: item.rtoAwb || po.rtoAwb,
                        boxCount: eeBoxCount,
                        appointmentDate: item.appointmentDate || po.appointmentDate,
                        appointmentRequestDate: item.appointmentRequestDate || po.appointmentRequestDate,
                        appointmentRequestId: item.appointmentRequestId || po.appointmentRequestId,
                        appointmentRequestTimestamp: item.appointmentRequestTimestamp || po.appointmentRequestTimestamp,
                        appointmentId: item.appointmentId || po.appointmentId,
                        appointmentTime: po.appointmentTime,
                        appointmentRemarks: po.appointmentRemarks,
                        qrCodeUrl: po.qrCodeUrl,
                        ewb: item.ewb || po.ewb,
                        fbaShipmentId: item.fbaShipmentId || po.fbaShipmentId,
                        shippingCharge: po.shippingCharge,
                        eeCustomerId: po.eeCustomerId,
                        consignmentQty: po.consignmentQty,
                        consignmentProducts: po.consignmentProducts,
                        consignmentValue: po.consignmentValue
                    };
                } else {
                    const curPo = String(po.id || '');
                    if (!groups[refCode].poReference.includes(curPo)) groups[refCode].poReference += `, ${curPo}`;
                    const statusRank = (s: string) => {
                        if (s === 'Returned') return 13;
                        if (s === 'RTO Initiated') return 12;
                        if (s === 'Closed') return 11;
                        if (s === 'Delivered') return 10;
                        if (s === 'Shipped') return 9;
                        if (s === 'Label Generated') return 8;
                        if (s === 'Create ASN') return 7;
                        if (s === 'Awaiting Appointment Confirmation') return 6;
                        if (s === 'Invoiced') return 4;
                        if (s === 'Batch Created') return 3;
                        if (s === 'Confirmed') return 2;
                        return 1;
                    };
                    if (statusRank(displayStatus) > statusRank(groups[refCode].status)) groups[refCode].status = displayStatus;
                    if (groups[refCode].orderDate === 'N/A' && effectiveOrderDate !== 'N/A') groups[refCode].orderDate = effectiveOrderDate;
                    if (!groups[refCode].batchCreatedAt) groups[refCode].batchCreatedAt = batchDate;
                    if (!groups[refCode].invoiceDate) groups[refCode].invoiceDate = item.invoiceDate;
                    if (!groups[refCode].manifestDate) groups[refCode].manifestDate = maniDate;
                    if (!groups[refCode].invoiceNumber) groups[refCode].invoiceNumber = invNum;

                    groups[refCode].boxCount = eeBoxCount;

                    if (!groups[refCode].awb && awb) groups[refCode].awb = awb;
                    if (!groups[refCode].trackingStatus && trackingStatus) groups[refCode].trackingStatus = trackingStatus;
                    if (!groups[refCode].trackingUrl && trackingUrl) groups[refCode].trackingUrl = trackingUrl;
                    if (!groups[refCode].ewb) groups[refCode].ewb = item.ewb || po.ewb;
                    if (!groups[refCode].fbaShipmentId) groups[refCode].fbaShipmentId = item.fbaShipmentId || po.fbaShipmentId;
                    if (!groups[refCode].appointmentId) groups[refCode].appointmentId = po.appointmentId;
                    if (!groups[refCode].qrCodeUrl) groups[refCode].qrCodeUrl = po.qrCodeUrl;
                    if (po.shippingCharge !== undefined) groups[refCode].shippingCharge = po.shippingCharge;
                    if (po.eeCustomerId) groups[refCode].eeCustomerId = po.eeCustomerId;
                }
                groups[refCode].items.push(item);
                groups[refCode].qty += effectiveQty;
                groups[refCode].amount += effectiveLineAmount;
            });
        });

        const results = Object.values(groups);

        results.forEach(so => {
            const hasInvoice = !!so.invoiceNumber && so.invoiceNumber !== 'GENERATING...';
            const progressRequiringInvoice = ['Label Generated', 'Shipped', 'Delivered'].includes(so.status);

            const isAmazonFbaYeio = (so.channel.toLowerCase().includes('amazon_fba') || so.channel.toLowerCase().includes('amazon fba')) &&
                (so.storeCode.toUpperCase() === 'YEIO');

            if (!hasInvoice && progressRequiringInvoice && !isAmazonFbaYeio) {
                so.status = 'Batch Created';
            }
        });

        return results;
    }, [purchaseOrders]);

    // Get unique channels from ALL shipments
    const uniqueChannels = useMemo(() => Array.from(new Set(allSalesOrders.map(so => so.channel))).sort(), [allSalesOrders]);

    // 2. Filter exactly like "Export CSV" feature
    const trackingOrders = useMemo(() => {
        const filtered = allSalesOrders.filter((so: GroupedSalesOrder) => {
            const channelLower = so.channel.toLowerCase();
            const allowedChannels = ['instamart', 'zepto', 'bb', 'rbl', 'flipkart', 'blinkit'];
            const isAllowedChannel = allowedChannels.some(c => channelLower.includes(c));

            if (!isAllowedChannel) return false;

            const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
            const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate || so.status === 'Delivered');

            if (isActuallyDelivered) return false; // User requested to completely hide Delivered orders

            let isTargetStatus = false;
            // Identify actual shipments (including Returned/RTO)
            if (so.status === 'Shipped' || so.status === 'RTO Initiated' || so.status === 'Returned') {
                isTargetStatus = true;
            }

            if (!isTargetStatus) return false;

            // Apply search filters
            const safePoNumber = so.poReference || '';
            const safeChannel = so.channel || '';
            const safeAwb = so.awb || '';

            const matchesSearch = searchTerm === '' ||
                safePoNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                safeChannel.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesAwb = awbSearch === '' ||
                safeAwb.toLowerCase().includes(awbSearch.toLowerCase());

            const matchesChannel = channelFilter === '' || so.channel === channelFilter;

            if (!matchesSearch || !matchesAwb || !matchesChannel) return false;

            // Apply Tab filter
            if (activeTab === 'RTO') {
                return so.status === 'RTO Initiated' || so.status === 'Returned';
            } else if (activeTab === 'Today') {
                return isSameDay(so.appointmentDate, todayDate) && so.status !== 'RTO Initiated' && so.status !== 'Returned';
            } else if (activeTab === 'Tomorrow') {
                return isSameDay(so.appointmentDate, tomorrowDate) && so.status !== 'RTO Initiated' && so.status !== 'Returned';
            } else if (activeTab === 'Missed') {
                const missedAppt = isPastDate(so.appointmentDate, todayDate);
                const missedEdd = !so.appointmentDate && isPastDate(so.edd, todayDate);
                return (missedAppt || missedEdd) && so.status !== 'RTO Initiated' && so.status !== 'Returned';
            } else if (activeTab === 'All') {
                // If "All" is selected but the order is "Returned" or "RTO Initiated", we probably still want it to show up, 
                // but if they strictly want Missed logic to be isolated, we are good.
            }

            return true;
        });

        const parseAppointmentDateTime = (date?: string, time?: string) => {
            if (!date) return 0;
            try {
                let d = new Date(date);
                if (d.getFullYear() < 2000) {
                    // Excel epoch bug usually maps to 1899. Return 0 to put it at the end.
                    return 0;
                }
                if (isNaN(d.getTime())) {
                    const parts = date.split('-');
                    if (parts.length === 3) {
                        if (parts[2].length === 4) {
                            d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                        } else {
                            d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                        }
                    }
                }

                if (time && !isNaN(d.getTime())) {
                    const timeStr = String(time).trim();
                    const ampmMatch = timeStr.match(/(\d{1,2}):(\d{1,2})\s*(AM|PM)/i);
                    if (ampmMatch) {
                        let hours = parseInt(ampmMatch[1], 10);
                        const minutes = parseInt(ampmMatch[2], 10);
                        const ampm = ampmMatch[3].toUpperCase();
                        if (ampm === 'PM' && hours < 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;
                        d.setHours(hours, minutes, 0, 0);
                    } else if (timeStr.includes('T')) {
                        const t = new Date(timeStr);
                        d.setHours(t.getHours(), t.getMinutes(), t.getSeconds());
                    } else {
                        const parts = timeStr.match(/(\d{1,2}):(\d{1,2})/);
                        if (parts) {
                            d.setHours(parseInt(parts[1]), parseInt(parts[2]), 0, 0);
                        }
                    }
                }
                return d.getTime();
            } catch (e) {
                return 0;
            }
        };

        // ASCEND order of appointment date
        filtered.sort((a, b) => {
            const timeA = parseAppointmentDateTime(a.appointmentDate, a.appointmentTime);
            const timeB = parseAppointmentDateTime(b.appointmentDate, b.appointmentTime);

            if (timeA > 0 && timeB > 0) return timeA - timeB; // Ascending
            if (timeA > 0) return -1;
            if (timeB > 0) return 1;

            const fallbackA = new Date(a.edd || a.orderDate || 0).getTime();
            const fallbackB = new Date(b.edd || b.orderDate || 0).getTime();
            return fallbackB - fallbackA; // Descending for others
        });

        return filtered;
    }, [allSalesOrders, searchTerm, awbSearch, channelFilter, activeTab, todayDate, tomorrowDate]);

    const getStatusBadge = (so: GroupedSalesOrder) => {
        const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
        const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate || so.status === 'Delivered');
        const isMissed = isPastDate(so.appointmentDate || so.edd, todayDate) && !isActuallyDelivered;

        if (isActuallyDelivered) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1 w-fit"><CheckCircleIcon className="w-3 h-3" /> Delivered</span>;
        if (so.status === 'RTO Initiated' || so.status === 'Returned' || so.status === 'RTO') return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit"><AlertIcon className="w-3 h-3" /> RTO / Returned</span>;
        if (isMissed) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit"><AlertIcon className="w-3 h-3" /> Missed</span>;
        if (so.appointmentDate) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 flex items-center gap-1 w-fit"><CalendarIcon className="w-3 h-3" /> Appt Confirmed</span>;
        if (so.awb) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700 flex items-center gap-1 w-fit"><TruckIcon className="w-3 h-3" /> In Transit</span>;

        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 w-fit">{so.status || 'Pending'}</span>;
    };

    // WhatsApp share handler
    const handleWhatsAppShare = useCallback(() => {
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

        // We need to categorize from the full unfiltered list (before tab filter)
        const baseOrders = allSalesOrders.filter((so: GroupedSalesOrder) => {
            const channelLower = so.channel.toLowerCase();
            const allowedChannels = ['instamart', 'zepto', 'bb', 'rbl', 'flipkart', 'blinkit'];
            const isAllowedChannel = allowedChannels.some(c => channelLower.includes(c));
            if (!isAllowedChannel) return false;
            const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
            const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate || so.status === 'Delivered');
            if (isActuallyDelivered) return false;
            if (so.status === 'RTO Initiated' || so.status === 'Returned') return false;
            return so.status === 'Shipped';
        });

        const missedOrders = baseOrders.filter(so => isPastDate(so.appointmentDate || so.edd, today));
        const todayOrders = baseOrders.filter(so => isSameDay(so.appointmentDate, today));
        const tomorrowOrders = baseOrders.filter(so => isSameDay(so.appointmentDate, tomorrow));

        const formatLine = (so: GroupedSalesOrder) => {
            const awb = so.awb || 'N/A';
            const apptDate = formatSafeDate(so.appointmentDate) || formatSafeDate(so.edd) || 'N/A';
            const apptTime = formatSafeTime(so.appointmentTime) || '';
            return `${awb} | ${apptDate}${apptTime ? ' ' + apptTime : ''}`;
        };

        let message = `📋 *Appointment Schedule Summary*\n📅 Date: ${todayStr}\n\n`;

        message += `🔴 *Missed Appointments (${missedOrders.length})*\n`;
        if (missedOrders.length > 0) {
            missedOrders.forEach(so => { message += formatLine(so) + '\n'; });
        } else {
            message += '_None_\n';
        }

        message += `\n🟠 *Today's Appointments (${todayOrders.length})*\n`;
        if (todayOrders.length > 0) {
            todayOrders.forEach(so => { message += formatLine(so) + '\n'; });
        } else {
            message += '_None_\n';
        }

        message += `\n🔵 *Tomorrow's Appointments (${tomorrowOrders.length})*\n`;
        if (tomorrowOrders.length > 0) {
            tomorrowOrders.forEach(so => { message += formatLine(so) + '\n'; });
        } else {
            message += '_None_\n';
        }

        // Build WhatsApp Web URL — pre-fill the logged-in user's contact number if available
        const phone = currentUser?.contactNumber ? currentUser.contactNumber.replace(/[^0-9]/g, '') : '';
        const encodedMessage = encodeURIComponent(message);
        const waUrl = phone
            ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodedMessage}`
            : `https://web.whatsapp.com/send?text=${encodedMessage}`;
        window.open(waUrl, '_blank');
    }, [allSalesOrders, currentUser]);

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
            {/* Header & Filters */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                {/* Priority Tabs */}
                <div className="flex space-x-4 mb-4 border-b border-gray-200 pb-2 overflow-x-auto">
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 whitespace-nowrap ${activeTab === 'All' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('All')}
                    >
                        All Shipments
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'Today' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('Today')}
                    >
                        Today's Appts
                        <span className="bg-orange-100 text-orange-600 py-0.5 px-2 rounded-full text-xs">Priority</span>
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'Tomorrow' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('Tomorrow')}
                    >
                        Tomorrow's Appts
                        <span className="bg-blue-100 text-blue-600 py-0.5 px-2 rounded-full text-xs">Upcoming</span>
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'Missed' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('Missed')}
                    >
                        Missed Deliveries
                        <span className="bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">Action Required</span>
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'RTO' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('RTO')}
                    >
                        RTO / Returned
                        <span className="bg-purple-100 text-purple-600 py-0.5 px-2 rounded-full text-xs">Alert</span>
                    </button>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by PO Number or Store..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="relative flex-1 min-w-[150px] max-w-[200px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FilterIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <select
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                            value={channelFilter}
                            onChange={(e) => setChannelFilter(e.target.value)}
                        >
                            <option value="">All Channels</option>
                            {uniqueChannels.map((c: string) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Filter by AWB Number..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-blue-50/30"
                            value={awbSearch}
                            onChange={(e) => setAwbSearch(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleWhatsAppShare}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm whitespace-nowrap"
                        title="Share appointment summary on WhatsApp"
                    >
                        <ChatIcon className="h-4 w-4" />
                        Share on WhatsApp
                    </button>
                </div>
            </div>

            {/* Tracking Table */}
            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 shrink-0">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[140px]">Channel &amp; Store</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px]">PO Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Quantities</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[220px]">Tracking Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[180px]">Status &amp; EDD</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[200px]">Appointment</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {trackingOrders.length > 0 ? trackingOrders.map((so: GroupedSalesOrder) => {
                                const isToday = isSameDay(so.appointmentDate, todayDate);
                                const isTomorrow = isSameDay(so.appointmentDate, tomorrowDate);
                                const isMissed = isPastDate(so.appointmentDate || so.edd, todayDate);

                                const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
                                const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate || so.status === 'Delivered');

                                let rowClass = "hover:bg-gray-50 transition-colors border-l-4 border-transparent";
                                if (isToday && !isActuallyDelivered) {
                                    rowClass = "bg-orange-50/60 hover:bg-orange-100 transition-colors border-l-4 border-orange-500";
                                } else if (isTomorrow && !isActuallyDelivered) {
                                    rowClass = "bg-blue-50/60 hover:bg-blue-100 transition-colors border-l-4 border-blue-500";
                                } else if (isMissed && !isActuallyDelivered) {
                                    rowClass = "bg-red-50 hover:bg-red-100/80 transition-colors border-l-4 border-red-500";
                                } else if (isActuallyDelivered) {
                                    rowClass = "bg-green-50/30 hover:bg-green-50 transition-colors border-l-4 border-green-400 opacity-80 cursor-default";
                                }

                                return (
                                    <tr key={so.id} className={rowClass}>
                                        {/* Channel & Store */}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900">{so.channel}</div>
                                            <div className="text-sm text-gray-500">{so.storeCode || '-'}</div>
                                        </td>

                                        {/* PO Details */}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-medium text-gray-900">{so.poReference}</div>
                                            <div className="text-xs text-gray-500">PO Date: {so.orderDate || '-'}</div>
                                            {so.poExpiryDate && <div className="text-xs text-red-500 mt-0.5">Exp: {so.poExpiryDate}</div>}
                                        </td>

                                        {/* Quantities */}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">Boxes: <span className="font-medium">{so.boxCount || '-'}</span></div>
                                            <div className="text-sm text-gray-500">Shipped Qty: <span className="font-medium">{so.qty || '-'}</span></div>
                                        </td>

                                        {/* Tracking Details */}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col gap-0.5">
                                                {so.awb ? (
                                                    <>
                                                        <div className="text-sm text-gray-900 flex items-center gap-1.5">
                                                            <span className="font-semibold">AWB:</span>
                                                            {so.trackingUrl ? (
                                                                <a href={so.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-900 font-medium underline">
                                                                    {so.awb}
                                                                </a>
                                                            ) : (
                                                                <span>{so.awb}</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-500"><span className="font-medium">Carrier:</span> {so.carrier || '-'}</div>
                                                        {so.currentLocation && <div className="text-xs text-gray-500 truncate mt-1" title={so.currentLocation}>📍 {so.currentLocation}</div>}
                                                    </>
                                                ) : (
                                                    <span className="text-sm text-gray-400 italic">No AWB Extracted</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Status & EDD */}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="mb-1.5 flex flex-col gap-1">
                                                {getStatusBadge(so)}
                                                {so.trackingStatus && <span className="text-xs font-semibold text-gray-700 w-40 truncate mt-0.5" title={so.trackingStatus}>Status: {so.trackingStatus}</span>}
                                                {so.latestStatus && <span className="text-xs text-gray-500 w-40 truncate" title={so.latestStatus}>{so.latestStatus}</span>}
                                            </div>
                                            <div className="text-xs text-gray-700 mt-1">
                                                <span className="font-bold border-t border-gray-200 pt-1 mt-1 block w-full">EDD: <span className="font-medium text-gray-600">{so.edd || so.poEdd || '-'}</span></span>
                                            </div>
                                        </td>

                                        {/* Appointment */}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {isToday && !isActuallyDelivered && <div className="text-xs text-orange-600 font-bold mb-1 uppercase tracking-wider animate-pulse">Today</div>}
                                            {isTomorrow && !isActuallyDelivered && <div className="text-xs text-blue-600 font-bold mb-1 uppercase tracking-wider">Tomorrow</div>}
                                            {isMissed && !isActuallyDelivered && <div className="text-xs text-red-600 font-bold mb-1 uppercase tracking-wider">Passed Deadline</div>}

                                            <div className="font-medium text-gray-900 mt-0.5">
                                                {so.appointmentDate ? (
                                                    <div className="flex flex-col">
                                                        <span>{formatSafeDate(so.appointmentDate) || so.appointmentDate}</span>
                                                        <span className="text-xs text-gray-600 font-normal">{formatSafeTime(so.appointmentTime)}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 italic font-normal">Pending Appt</span>
                                                )}
                                            </div>

                                            {so.appointmentId && (
                                                <div className="text-xs text-indigo-600 bg-indigo-50 py-0.5 px-1.5 rounded mt-1.5 inline-block font-medium w-fit border border-indigo-100">
                                                    ID: {so.appointmentId}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            }) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <TruckIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                        <p className="text-lg font-medium">No shipments matching criteria</p>
                                        <p className="text-sm mt-1">Adjust filters or select another tab.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ShipmentManager;
