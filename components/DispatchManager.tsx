import React, { useState, useMemo, useCallback } from 'react';
import { PurchaseOrder, POItem, User } from '../types';
import { TruckIcon, SearchIcon, AlertIcon, CheckCircleIcon, CalendarIcon, FilterIcon, RefreshIcon, ClockIcon } from './icons/Icons';
import { updatePOStatus } from '../services/api';

interface GroupedSalesOrder {
    id: string; // eeReferenceCode
    poReference: string;
    status: string;
    originalEeStatus: string;
    channel: string;
    storeCode: string;
    orderDate: string;
    qty: number;
    amount: number;
    items: POItem[];
    carrier?: string;
    awb?: string;
    trackingStatus?: string;
    pickupDate?: string;
    boxCount: number;
}

interface DispatchManagerProps {
    purchaseOrders: PurchaseOrder[];
    currentUser?: User | null;
    initialTab?: 'Missed' | 'Today' | 'Upcoming' | 'All';
}

// Helper to safely format dates
const formatSafeDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        if (d.getFullYear() < 2000) return '';
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
};

const DispatchManager: React.FC<DispatchManagerProps> = ({ purchaseOrders, currentUser, initialTab = 'All' }: DispatchManagerProps) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [channelFilter, setChannelFilter] = useState('');
    const [awbSearch, setAwbSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'Missed' | 'Today' | 'Upcoming' | 'All'>(initialTab);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const todayDate = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const safeParseDate = (dateStr: string | undefined): Date | null => {
        if (!dateStr) return null;
        
        // Try standard parsing first
        let d = new Date(dateStr);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
            return d;
        }

        // Try replacing slashes with hyphens
        const cleanStr = dateStr.replace(/\//g, '-').trim();
        const parts = cleanStr.split('-');
        
        if (parts.length === 3) {
            const p0 = parseInt(parts[0], 10);
            const p1 = parseInt(parts[1], 10);
            const p2 = parseInt(parts[2], 10);

            if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
                // Case 1: YYYY-MM-DD
                if (parts[0].length === 4) {
                    return new Date(p0, p1 - 1, p2);
                }
                // Case 2: DD-MM-YYYY
                if (parts[2].length === 4) {
                    return new Date(p2, p1 - 1, p0);
                }
                // Case 3: DD-MM-YY (2-digit year)
                if (parts[2].length === 2) {
                    return new Date(p2 + 2000, p1 - 1, p0);
                }
            }
        }

        // Try parsing textual month names like "22 Jul 2026" or "22-Jul-2026"
        const spaceStr = dateStr.replace(/-/g, ' ');
        const dSpace = new Date(spaceStr);
        if (!isNaN(dSpace.getTime()) && dSpace.getFullYear() >= 2000) {
            return dSpace;
        }

        return null;
    };

    const isSameDay = (d1Str?: string, compare: Date = todayDate) => {
        const d1 = safeParseDate(d1Str);
        if (!d1) return false;
        return d1.toDateString() === compare.toDateString();
    };

    const isUpcoming = (d1Str?: string, compare: Date = todayDate) => {
        const d1 = safeParseDate(d1Str);
        if (!d1) return false;
        
        // Compare only date parts
        const d1Date = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
        const compareDate = new Date(compare.getFullYear(), compare.getMonth(), compare.getDate());
        return d1Date > compareDate;
    };

    const isMissed = (d1Str?: string, compare: Date = todayDate) => {
        const d1 = safeParseDate(d1Str);
        if (!d1) return false;
        
        const d1Date = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
        const compareDate = new Date(compare.getFullYear(), compare.getMonth(), compare.getDate());
        return d1Date < compareDate;
    };

    const handleMarkDispatched = useCallback(async (so: GroupedSalesOrder) => {
        if (!window.confirm(`Mark ${so.id} as Dispatched?`)) return;
        setUpdatingId(so.id);
        try {
            await updatePOStatus(so.id, 'Dispatched');
            alert('Marked as Dispatched successfully!');
            // In a real app, we'd trigger a reload or update local state
        } catch (error) {
            alert('Failed to update status.');
        } finally {
            setUpdatingId(null);
        }
    }, []);

    const allSalesOrders = useMemo(() => {
        const groups: Record<string, GroupedSalesOrder> = {};

        purchaseOrders.forEach(po => {
            (po.items || []).forEach(item => {
                if (!item.eeReferenceCode) return;
                const refCode = item.eeReferenceCode;

                // Compute displayStatus to filter out Dispatched/Shipped
                const eeStatusLower = (item.eeOrderStatus || po.eeOrderStatus || '').toLowerCase().trim();
                const trackingStatusLower = (item.trackingStatus || po.trackingStatus || '').toLowerCase();
                const maniDate = item.eeManifestDate || po.eeManifestDate;
                const rtoStatus = item.rtoStatus || po.rtoStatus;
                const isRTOInitiated = eeStatusLower === 'shipped' && rtoStatus;
                const isActuallyDelivered = trackingStatusLower === 'delivered' || trackingStatusLower === 'successfully delivered' || !!item.deliveredDate || !!po.deliveredDate;
                const isOutOfDelivery = trackingStatusLower === 'out for delivery';
                const isDeliveredStatus = isActuallyDelivered && !isOutOfDelivery;
                const isAmazon = po.channel.toLowerCase().includes('amazon');
                const isAmazonOrFlipkart = isAmazon || po.channel.toLowerCase().includes('flipkart');

                let displayStatus = 'Processing';
                if (po.poDbStatus === 'RTD') {
                    displayStatus = 'Ready to Dispatch';
                } else if (eeStatusLower === 'returned' || eeStatusLower === 'rto') displayStatus = 'Returned';
                else if (isRTOInitiated) displayStatus = 'RTO Initiated';
                else if (rtoStatus) displayStatus = 'Returned';
                else if (eeStatusLower === 'closed') displayStatus = 'Closed';
                else if (eeStatusLower === 'dispatched') displayStatus = 'Shipped'; // dispatched => goes to Shipped
                else if (isDeliveredStatus) displayStatus = 'Delivered';
                else if (eeStatusLower === 'shipped' || maniDate || trackingStatusLower === 'in transit' || isOutOfDelivery) {
                    displayStatus = isAmazonOrFlipkart ? 'Delivered' : 'Shipped';
                }
                else if (eeStatusLower === 'rtd' || eeStatusLower === 'ready to dispatch') displayStatus = 'Ready to Dispatch';

                // Only include 'Ready to Dispatch' orders here
                if (displayStatus !== 'Ready to Dispatch') return;

                if (!groups[refCode]) {
                    let eeBoxCount = 0;
                    try {
                        eeBoxCount = item.eeBoxCount || po.eeReferenceBoxCount || 0;
                    } catch (e) {}

                    groups[refCode] = {
                        id: refCode,
                        poReference: String(po.id),
                        status: displayStatus,
                        originalEeStatus: eeStatusLower,
                        channel: po.channel,
                        storeCode: po.storeCode || '',
                        orderDate: po.orderDate,
                        qty: item.qty || 0,
                        amount: po.totalPoValue || 0,
                        items: [item],
                        carrier: item.carrier || po.carrier,
                        awb: item.awb || po.awb,
                        trackingStatus: item.trackingStatus || po.trackingStatus,
                        pickupDate: item.pickupDate || po.pickupDate,
                        boxCount: eeBoxCount
                    };
                } else {
                    const curPo = String(po.id || '');
                    if (!groups[refCode].poReference.includes(curPo)) {
                        groups[refCode].poReference += `, ${curPo}`;
                    }
                    groups[refCode].qty += (item.qty || 0);
                    groups[refCode].items.push(item);
                }
            });
        });

        return Object.values(groups);
    }, [purchaseOrders]);

    const uniqueChannels = useMemo(() => 
        Array.from(new Set(allSalesOrders.map((so: GroupedSalesOrder) => so.channel))).sort()
    , [allSalesOrders]);

    const filteredOrders = useMemo(() => {
        return allSalesOrders.filter((so: GroupedSalesOrder) => {
            const matchesSearch = searchTerm === '' || 
                (so.id && String(so.id).toLowerCase().includes(searchTerm.toLowerCase())) ||
                (so.poReference && String(so.poReference).toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesAwb = awbSearch === '' || 
                (so.awb && String(so.awb).toLowerCase().includes(awbSearch.toLowerCase()));
            
            const matchesChannel = channelFilter === '' || so.channel === channelFilter;

            if (!matchesSearch || !matchesAwb || !matchesChannel) return false;

            // Tab Filters — All orders here are 'Ready to Dispatch' already
            // Tab Filters — All orders here are 'Ready to Dispatch' already
            if (activeTab === 'Missed') {
                return isMissed(so.pickupDate);
            } else if (activeTab === 'Today') {
                return isSameDay(so.pickupDate);
            } else if (activeTab === 'Upcoming') {
                return isUpcoming(so.pickupDate);
            }

            return true;
        }).sort((a: GroupedSalesOrder, b: GroupedSalesOrder) => {
            const dateA = new Date(a.pickupDate || 0).getTime();
            const dateB = new Date(b.pickupDate || 0).getTime();
            return dateA - dateB;
        });
    }, [allSalesOrders, searchTerm, awbSearch, channelFilter, activeTab, todayDate]);

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <TruckIcon className="w-8 h-8 text-indigo-600" />
                            Dispatch Manager
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Manage warehouse dispatches and pickup schedules</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 mt-6 overflow-x-auto scrollbar-hide">
                    {(['Missed', 'Today', 'Upcoming', 'All'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                                activeTab === tab
                                    ? 'border-indigo-600 text-indigo-600'
                                    : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {tab === 'Missed' && 'Missed Pickups'}
                            {tab === 'Today' && "Today's Pickups"}
                            {tab === 'Upcoming' && 'Upcoming Pickups'}
                            {tab === 'All' && 'All Shipments'}
                            
                            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs transition-colors ${
                                activeTab === tab ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500 font-medium'
                            }`}>
                                {allSalesOrders.filter(so => {
                                    if (tab === 'Missed') return isMissed(so.pickupDate);
                                    if (tab === 'Today') return isSameDay(so.pickupDate);
                                    if (tab === 'Upcoming') return isUpcoming(so.pickupDate);
                                    return true;
                                }).length}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[240px]">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by Order ID or PO..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>

                <div className="relative flex-1 min-w-[200px]">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by AWB..."
                        value={awbSearch}
                        onChange={(e) => setAwbSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>

                <div className="relative w-48">
                    <FilterIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                        value={channelFilter}
                        onChange={(e) => setChannelFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm appearance-none focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">All Channels</option>
                        {uniqueChannels.map(channel => (
                            <option key={channel} value={channel}>{channel}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Order Details</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Courier & AWB</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Box Count</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Pickup Date</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredOrders.length > 0 ? filteredOrders.map(so => (
                                <tr key={so.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-bold text-gray-900">{so.id}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">PO: {so.poReference}</div>
                                        <div className="text-xs font-semibold text-indigo-600 mt-1 uppercase tracking-wider">{so.channel}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-900 font-medium">{so.carrier || 'N/A'}</div>
                                        <div className="text-xs text-gray-500 font-mono mt-0.5">{so.awb || 'No AWB'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-sm font-bold border border-gray-200">
                                                {so.boxCount}
                                            </span>
                                            <span className="text-xs text-gray-400">Boxes</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                                            <ClockIcon className="w-4 h-4 text-indigo-500" />
                                            {formatSafeDate(so.pickupDate) || <span className="text-gray-400 font-normal italic">Pending</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase tracking-tighter ${
                                            so.status === 'Dispatched' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                            {so.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {so.status !== 'Dispatched' ? (
                                            <button
                                                onClick={() => handleMarkDispatched(so)}
                                                disabled={updatingId === so.id}
                                                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 transition-all flex items-center gap-2 shadow-sm"
                                            >
                                                {updatingId === so.id ? <RefreshIcon className="w-3.5 h-3.5 animate-spin" /> : <TruckIcon className="w-3.5 h-3.5" />}
                                                Mark Dispatched
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-green-600 text-xs font-bold">
                                                <CheckCircleIcon className="w-4 h-4" />
                                                Dispatched
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <TruckIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                        <p className="text-lg font-medium">No dispatch orders found</p>
                                        <p className="text-sm mt-1">Adjust your filters or tab selection.</p>
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

export default DispatchManager;
