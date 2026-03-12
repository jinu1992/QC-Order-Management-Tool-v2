import React, { useState, useMemo } from 'react';
import { PurchaseOrder } from '../types';
import { TruckIcon, SearchIcon, AlertIcon, CheckCircleIcon, CalendarIcon } from './icons/Icons';

interface ShipmentManagerProps {
    purchaseOrders: PurchaseOrder[];
}

const ShipmentManager: React.FC<ShipmentManagerProps> = ({ purchaseOrders }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [awbSearch, setAwbSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'All' | 'Today' | 'Tomorrow'>('All');

    const todayDate = useMemo(() => new Date(), []);
    const tomorrowDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
    }, []);

    const isSameDay = (dateStr: string | undefined, targetDate: Date) => {
        if (!dateStr) return false;
        // Basic parsing, trying to format to standard date
        // Usually date formats are yyyy-mm-dd or similar, JS Date can typically parse reasonably
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        return d.toDateString() === targetDate.toDateString();
    };

    // Filter POs to only those that might have tracking (Invoiced or beyond)
    // and apply search/AWB/Tab filters
    const trackingOrders = useMemo(() => {
        const filtered = purchaseOrders.filter(po => {
            // Include orders that have some tracking info or are beyond basic confirmation
            const hasTrackingInfo = po.awb || po.trackingStatus || po.latestTrackingStatus || po.currentLocation || po.appointmentDate;
            const isAdvancedState = ['Invoiced', 'In-Transit', 'Delivered', 'RTO Initiated', 'Returned', 'Appointment to be taken'].includes(po.status as string);
            
            if (!hasTrackingInfo && !isAdvancedState) return false;

            // Apply search filters
            const matchesSearch = searchTerm === '' || 
                po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                po.channel.toLowerCase().includes(searchTerm.toLowerCase());
                
            const matchesAwb = awbSearch === '' || 
                (po.awb && po.awb.toLowerCase().includes(awbSearch.toLowerCase()));

            if (!matchesSearch || !matchesAwb) return false;

            // Apply Tab filter
            if (activeTab === 'Today') {
                return isSameDay(po.appointmentDate, todayDate);
            } else if (activeTab === 'Tomorrow') {
                return isSameDay(po.appointmentDate, tomorrowDate);
            }

            return true;
        });

        // ASCEND order of appointment date
        filtered.sort((a, b) => {
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

            // If no appointment, sort by EDD ascending as fallback, or order date
            const fallbackA = new Date(a.edd || a.orderDate || 0).getTime();
            const fallbackB = new Date(b.edd || b.orderDate || 0).getTime();
            return fallbackB - fallbackA; // Descending for others as secondary fallback
        });

        return filtered;
    }, [purchaseOrders, searchTerm, awbSearch, activeTab, todayDate, tomorrowDate]);

    const getStatusBadge = (so: PurchaseOrder) => {
        const status = (so.status as string) || 'Pending';
        
        if (status === 'Delivered') return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1 w-fit"><CheckCircleIcon className="w-3 h-3" /> Delivered</span>;
        if (status === 'RTO Initiated' || status === 'Returned' || status === 'RTO') return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit"><AlertIcon className="w-3 h-3" /> RTO / Returned</span>;
        if (so.appointmentDate) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 flex items-center gap-1 w-fit"><CalendarIcon className="w-3 h-3" /> Appt Confirmed</span>;
        if (so.awb) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700 flex items-center gap-1 w-fit"><TruckIcon className="w-3 h-3" /> In Transit</span>;
        
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 w-fit">{status}</span>;
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
            {/* Header & Filters */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                            <TruckIcon className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Shipment Tracking</h2>
                            <p className="text-sm text-gray-500">Track deliveries, appointments, and priority orders</p>
                        </div>
                    </div>
                </div>

                {/* Priority Tabs */}
                <div className="flex space-x-4 mb-4 border-b border-gray-200 pb-2">
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 ${activeTab === 'All' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('All')}
                    >
                        All Shipments
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 ${activeTab === 'Today' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('Today')}
                    >
                        Today's Appts
                        <span className="bg-orange-100 text-orange-600 py-0.5 px-2 rounded-full text-xs">Priority</span>
                    </button>
                    <button
                        className={`pb-2 px-1 text-sm font-medium transition-colors relative border-b-2 flex items-center gap-2 ${activeTab === 'Tomorrow' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        onClick={() => setActiveTab('Tomorrow')}
                    >
                        Tomorrow's Appts
                        <span className="bg-blue-100 text-blue-600 py-0.5 px-2 rounded-full text-xs">Upcoming</span>
                    </button>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by PO Number or Channel..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-partners-green focus:border-partners-green"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Filter by AWB Number..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-partners-green focus:border-partners-green bg-blue-50/30"
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
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Channel &amp; Store</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">PO Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Quantities</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tracking</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status &amp; EDD</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Appointment</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {trackingOrders.length > 0 ? trackingOrders.map((so) => {
                                const isToday = isSameDay(so.appointmentDate, todayDate);
                                const isTomorrow = isSameDay(so.appointmentDate, tomorrowDate);
                                
                                let rowClass = "hover:bg-gray-50 transition-colors border-l-4 border-transparent";
                                if (isToday) {
                                    rowClass = "bg-orange-50/60 hover:bg-orange-100 transition-colors border-l-4 border-orange-500";
                                } else if (isTomorrow) {
                                    rowClass = "bg-blue-50/60 hover:bg-blue-100 transition-colors border-l-4 border-blue-500";
                                }

                                return (
                                <tr key={so.id} className={rowClass}>
                                    {/* Channel & Store Array */}
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
                                    
                                    {/* Quantities (Box Count & Shipped) */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">Boxes: <span className="font-medium">{so.boxes || so.eeReferenceBoxCount || '-'}</span></div>
                                        <div className="text-sm text-gray-500">Shipped: <span className="font-medium">{so.items?.reduce((acc, item) => acc + (item.shippedQuantity || 0), 0) || '-'}</span></div>
                                    </td>

                                    {/* Tracking (AWB, Carrier, URL) */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            {so.awb ? (
                                                <>
                                                    {so.trackingUrl ? (
                                                        <a href={so.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-900 font-medium underline flex items-center gap-1">
                                                            {so.awb}
                                                        </a>
                                                    ) : (
                                                        <span className="text-sm font-medium text-gray-900">{so.awb}</span>
                                                    )}
                                                    <span className="text-xs text-gray-500">{so.carrier || '-'}</span>
                                                </>
                                            ) : (
                                                <span className="text-sm text-gray-400 italic">No AWB yet</span>
                                            )}
                                        </div>
                                    </td>
                                    
                                    {/* Status & EDD */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="mb-1.5 flex flex-col gap-1">
                                            {getStatusBadge(so)}
                                            {so.latestTrackingStatus && <span className="text-xs text-gray-400 w-40 truncate" title={so.latestTrackingStatus}>{so.latestTrackingStatus}</span>}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            <span className="font-medium">EDD:</span> {so.edd || so.poEdd || '-'}
                                        </div>
                                    </td>

                                    {/* Appointment Date & Time, ID */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {isToday && <div className="text-xs text-orange-600 font-bold mb-1 uppercase tracking-wider">Today</div>}
                                        {isTomorrow && <div className="text-xs text-blue-600 font-bold mb-1 uppercase tracking-wider">Tomorrow</div>}
                                        
                                        <div className="font-medium text-gray-900">
                                            {so.appointmentDate ? (
                                                `${so.appointmentDate} ${so.appointmentTime || ''}`
                                            ) : (
                                                <span className="text-gray-400 italic font-normal">Pending Appt</span>
                                            )}
                                        </div>
                                        
                                        {so.appointmentId && (
                                            <div className="text-xs text-gray-500 mt-0.5">ID: {so.appointmentId}</div>
                                        )}
                                    </td>
                                </tr>
                            )}) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <TruckIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                        <p className="text-lg font-medium">No tracking records found</p>
                                        <p className="text-sm">Try adjusting your filters or AWB search.</p>
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
