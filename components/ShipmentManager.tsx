import React, { useState, useMemo } from 'react';
import { PurchaseOrder } from '../types';
import { TruckIcon, SearchIcon, AlertIcon, CheckCircleIcon, CalendarIcon } from './icons/Icons';

interface ShipmentManagerProps {
    purchaseOrders: PurchaseOrder[];
}

const ShipmentManager: React.FC<ShipmentManagerProps> = ({ purchaseOrders }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [awbSearch, setAwbSearch] = useState('');

    // Filter POs to only those that might have tracking (Invoiced or beyond)
    // and apply search/AWB filters
    const trackingOrders = useMemo(() => {
        return purchaseOrders.filter(po => {
            // Include orders that have some tracking info or are beyond basic confirmation
            const hasTrackingInfo = po.awb || po.trackingStatus || po.latestTrackingStatus || po.currentLocation || po.appointmentDate;
            const isAdvancedState = ['Invoiced', 'In-Transit', 'Delivered', 'RTO Initiated', 'Returned', 'Appointment to be taken'].includes(po.status);
            
            if (!hasTrackingInfo && !isAdvancedState) return false;

            // Apply search filters
            const matchesSearch = searchTerm === '' || 
                po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                po.channel.toLowerCase().includes(searchTerm.toLowerCase());
                
            const matchesAwb = awbSearch === '' || 
                (po.awb && po.awb.toLowerCase().includes(awbSearch.toLowerCase()));

            return matchesSearch && matchesAwb;
        }).sort((a, b) => {
            // Sort by dispatch date or order date descending
            const dateA = new Date(a.dispatchDate || a.orderDate || 0).getTime();
            const dateB = new Date(b.dispatchDate || b.orderDate || 0).getTime();
            return dateB - dateA;
        });
    }, [purchaseOrders, searchTerm, awbSearch]);

    const getStatusBadge = (so: PurchaseOrder) => {
        const status = so.status || 'Pending';
        
        if (status === 'Delivered') return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1"><CheckCircleIcon className="w-3 h-3" /> Delivered</span>;
        if (status === 'RTO Initiated' || status === 'Returned') return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1"><AlertIcon className="w-3 h-3" /> RTO / Returned</span>;
        if (so.appointmentDate) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> Appt: {so.appointmentDate}</span>;
        if (so.awb) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700 flex items-center gap-1"><TruckIcon className="w-3 h-3" /> In Transit</span>;
        
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">{status}</span>;
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
                            <p className="text-sm text-gray-500">Track deliveries and appointments</p>
                        </div>
                    </div>
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
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Order Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tracking Info</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date/Location</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {trackingOrders.length > 0 ? trackingOrders.map((so) => (
                                <tr key={so.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="font-medium text-gray-900">{so.poNumber}</div>
                                        <div className="text-sm text-gray-500">{so.channel} {so.storeCode ? `(${so.storeCode})` : ''}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            {so.awb ? (
                                                <>
                                                    <span className="text-sm font-medium text-gray-900">{so.awb}</span>
                                                    <span className="text-xs text-gray-500">{so.carrier || 'N/A'}</span>
                                                </>
                                            ) : (
                                                <span className="text-sm text-gray-400 italic">No AWB yet</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {getStatusBadge(so)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {so.deliveredDate ? (
                                            <div><span className="font-medium">Delivered:</span> {so.deliveredDate}</div>
                                        ) : so.edd ? (
                                            <div><span className="font-medium">EDD:</span> {so.edd}</div>
                                        ) : so.appointmentDate ? (
                                            <div><span className="font-medium">Appt:</span> {so.appointmentDate}</div>
                                        ) : so.dispatchDate ? (
                                            <div><span className="font-medium">Dispatched:</span> {so.dispatchDate}</div>
                                        ) : (
                                            <span className="text-gray-400">Pending Date</span>
                                        )}
                                        
                                        {so.currentLocation && (
                                            <div className="text-xs mt-1 text-gray-400 truncate max-w-[200px]" title={so.currentLocation}>
                                                📍 {so.currentLocation}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
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
