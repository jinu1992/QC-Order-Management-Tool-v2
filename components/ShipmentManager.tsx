import React, { useState, useMemo } from 'react';
import { PurchaseOrder } from '../types';
import { TruckIcon, SearchIcon, AlertIcon, CheckCircleIcon, CalendarIcon, FilterIcon } from './icons/Icons';

interface ShipmentManagerProps {
    purchaseOrders: PurchaseOrder[];
}

const ShipmentManager: React.FC<ShipmentManagerProps> = ({ purchaseOrders }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [channelFilter, setChannelFilter] = useState('');
    const [awbSearch, setAwbSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'All' | 'Today' | 'Tomorrow' | 'Missed'>('All');

    const todayDate = useMemo(() => new Date(), []);
    const tomorrowDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
    }, []);

    // Get unique channels for filter dropdown
    const uniqueChannels = useMemo(() => {
        const channels = new Set<string>();
        purchaseOrders.forEach((po: PurchaseOrder) => {
            if (po.channel) channels.add(po.channel);
        });
        return Array.from(channels).sort();
    }, [purchaseOrders]);

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
        // Strip time for strict day comparison
        const d1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const compare = new Date(compareDate.getFullYear(), compareDate.getMonth(), compareDate.getDate());
        return d1 < compare;
    };

    // Filter POs
    const trackingOrders = useMemo(() => {
        const filtered = purchaseOrders.filter((po: PurchaseOrder) => {
            const channelLower = (po.channel || '').toLowerCase();
            const allowedChannels = ['instamart', 'zepto', 'bb', 'rbl', 'flipkart', 'blinkit'];
            const isAllowedChannel = allowedChannels.some(c => channelLower.includes(c));
            
            if (!isAllowedChannel) return false;

            const isAmazon = channelLower.includes('amazon');
            const trackingStatusLower = (po.trackingStatus || '').toLowerCase();
            const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!po.deliveredDate);
            
            // Allow only specific statuses
            const currentStatus = String(po.status || '');
            const isTargetStatus = currentStatus === 'Shipped' || currentStatus === 'RTO Initiated' || currentStatus === 'Returned';
            
            if (!isTargetStatus) {
                // If it's Amazon, 'Delivered' is allowed ONLY if not *actually* delivered yet
                const isAmazonDelivered = isAmazon && currentStatus === 'Delivered' && !isActuallyDelivered;
                
                if (!isAmazonDelivered) {
                    return false;
                }
            }

            // Apply search filters
            const safePoNumber = po.poNumber || '';
            const safeChannel = po.channel || '';
            const safeAwb = po.awb || '';

            const matchesSearch = searchTerm === '' || 
                safePoNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                safeChannel.toLowerCase().includes(searchTerm.toLowerCase());
                
            const matchesAwb = awbSearch === '' || 
                safeAwb.toLowerCase().includes(awbSearch.toLowerCase());
                
            const matchesChannel = channelFilter === '' || po.channel === channelFilter;

            if (!matchesSearch || !matchesAwb || !matchesChannel) return false;
            // Determine delivered status
            const currentTrackingStatusLower = (po.trackingStatus || '').toLowerCase();
            const currentIsActuallyDelivered = (currentTrackingStatusLower === 'delivered' || currentTrackingStatusLower === 'successfully delivered' || !!po.deliveredDate || po.status === 'Delivered');

            // Apply Tab filter
            if (activeTab === 'Today') {
                return isSameDay(po.appointmentDate, todayDate) && !currentIsActuallyDelivered;
            } else if (activeTab === 'Tomorrow') {
                return isSameDay(po.appointmentDate, tomorrowDate) && !currentIsActuallyDelivered;
            } else if (activeTab === 'Missed') {
                // Missed delivery implies appointment date has passed but not delivered
                const missedAppt = isPastDate(po.appointmentDate, todayDate) && !currentIsActuallyDelivered;
                const missedEdd = !po.appointmentDate && isPastDate(po.edd, todayDate) && !currentIsActuallyDelivered;
                return missedAppt || missedEdd;
            }

            return true;
        });

        // ASCEND order of appointment date
        filtered.sort((a: PurchaseOrder, b: PurchaseOrder) => {
            const hasApptA = !!a.appointmentDate;
            const hasApptB = !!b.appointmentDate;

            if (hasApptA && hasApptB) {
                const dateA = new Date(a.appointmentDate!).getTime();
                const dateB = new Date(b.appointmentDate!).getTime();
                if (!isNaN(dateA) && !isNaN(dateB)) {
                    return dateA - dateB; // Ascending
                }
            }
            if (hasApptA && !hasApptB) return -1;
            if (!hasApptA && hasApptB) return 1;

            const fallbackA = new Date(a.edd || a.orderDate || 0).getTime();
            const fallbackB = new Date(b.edd || b.orderDate || 0).getTime();
            return fallbackB - fallbackA; // Descending for others
        });

        return filtered;
    }, [purchaseOrders, searchTerm, awbSearch, channelFilter, activeTab, todayDate, tomorrowDate]);

    const getStatusBadge = (so: PurchaseOrder) => {
        const trackingStatusLower = (so.trackingStatus || '').toLowerCase();
        const isActuallyDelivered = (trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!so.deliveredDate || so.status === 'Delivered');
        const isMissed = isPastDate(so.appointmentDate || so.edd, todayDate) && !isActuallyDelivered;

        if (isActuallyDelivered) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1 w-fit"><CheckCircleIcon className="w-3 h-3" /> Delivered</span>;
        if ((so.status as unknown as string) === 'RTO Initiated' || (so.status as unknown as string) === 'Returned' || (so.status as unknown as string) === 'RTO') return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit"><AlertIcon className="w-3 h-3" /> RTO / Returned</span>;
        if (isMissed) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit"><AlertIcon className="w-3 h-3" /> Missed</span>;
        if (so.appointmentDate) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 flex items-center gap-1 w-fit"><CalendarIcon className="w-3 h-3" /> Appt Confirmed</span>;
        if (so.awb) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700 flex items-center gap-1 w-fit"><TruckIcon className="w-3 h-3" /> In Transit</span>;
        
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 w-fit">{so.status || 'Pending'}</span>;
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
            {/* Header & Filters */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                {/* Header title removed to avoid duplication with App.tsx */}

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
                            {trackingOrders.length > 0 ? trackingOrders.map((so: PurchaseOrder) => {
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
                                        <div className="font-medium text-gray-900">{so.poNumber}</div>
                                        <div className="text-xs text-gray-500">PO Date: {so.orderDate || '-'}</div>
                                        {so.poExpiryDate && <div className="text-xs text-red-500 mt-0.5">Exp: {so.poExpiryDate}</div>}
                                    </td>
                                    
                                    {/* Quantities */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">Boxes: <span className="font-medium">{so.boxes || so.eeReferenceBoxCount || '-'}</span></div>
                                        <div className="text-sm text-gray-500">Shipped Qty: <span className="font-medium">{so.items?.reduce((acc: number, item: any) => acc + (item.shippedQuantity || 0), 0) || '-'}</span></div>
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
                                                    <span>{so.appointmentDate}</span>
                                                    <span className="text-xs text-gray-600 font-normal">{so.appointmentTime || ''}</span>
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
                            )}) : (
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
