
import React, { useState, useMemo, Fragment } from 'react';
import { Quotation, QuotationItem } from '../types';
import { RefreshIcon, CheckCircleIcon, ClockIcon, ChevronDownIcon, ChevronRightIcon, CubeIcon, CurrencyIcon, UserIcon, CalendarIcon, HashIcon } from './icons/Icons';
import { acceptQuotation, refreshQuotationsFromBackend } from '../services/api';

interface QuotationsManagerProps {
    quotations: any[]; // Using any because raw data from sheet is line-item based
    onRefresh: () => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const QuotationsManager: React.FC<QuotationsManagerProps> = ({ quotations, onRefresh, addNotification }) => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Sort quotations by date descending
    const sortedQuotations = useMemo(() => {
        return [...quotations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [quotations]);

    const handleBackendRefresh = async () => {
        setIsRefreshing(true);
        try {
            const res = await refreshQuotationsFromBackend();
            if (res.status === 'success') {
                addNotification(res.message || 'Quotations refresh triggered successfully.', 'success');
                onRefresh();
            } else {
                addNotification(res.message || 'Failed to refresh quotations.', 'error');
            }
        } catch (error: any) {
            addNotification(error.message || 'Error refreshing quotations.', 'error');
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleAccept = async (quotation: Quotation) => {
        setProcessingId(quotation.estimateId);
        try {
            const res = await acceptQuotation(quotation);
            if (res.status === 'success') {
                addNotification(res.message || `Quotation ${quotation.quotationNumber} accepted and estimate sent.`, 'success');
                onRefresh();
            } else {
                addNotification(res.message || 'Failed to accept quotation.', 'error');
            }
        } catch (error: any) {
            addNotification(error.message || 'Error accepting quotation.', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-partners-gray-bg">
            <div className="p-6 border-b border-partners-border bg-white flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-partners-green/10 rounded-2xl">
                        <CubeIcon className="h-6 w-6 text-partners-green" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 tracking-tight">Quotations</h2>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-0.5">Manage and accept customer quotations from Zoho</p>
                    </div>
                </div>
                <button 
                    onClick={handleBackendRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-6 py-2.5 bg-partners-green text-white rounded-xl font-bold text-sm hover:bg-green-600 transition-all shadow-lg shadow-green-100 disabled:opacity-50 active:scale-95"
                >
                    <RefreshIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? 'Refreshing...' : 'Refresh from Zoho'}
                </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-2xl border border-partners-border shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-partners-border">
                                <th className="w-12 px-6 py-4"></th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Quote Info</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Customer</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Date</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Amount</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-partners-border">
                            {sortedQuotations.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center text-gray-400 italic">
                                        <div className="flex flex-col items-center gap-3">
                                            <CubeIcon className="h-12 w-12 opacity-20" />
                                            <p>No quotations found. Click refresh to fetch latest data.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                sortedQuotations.map((q) => (
                                    <Fragment key={q.id}>
                                        <tr 
                                            className={`hover:bg-gray-50 transition-colors cursor-pointer ${expandedId === q.id ? 'bg-gray-50' : ''}`}
                                            onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                                        >
                                            <td className="px-6 py-4">
                                                {expandedId === q.id ? <ChevronDownIcon className="h-4 w-4 text-partners-green" /> : <ChevronRightIcon className="h-4 w-4 text-gray-300" />}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-gray-800">{q.quotationNumber}</span>
                                                    <span className="text-[10px] font-bold text-gray-400 font-mono mt-0.5">ID: {q.estimateId}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                                                        {q.customerName.charAt(0)}
                                                    </div>
                                                    <span className="text-sm font-bold text-gray-700">{q.customerName}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5 text-gray-500">
                                                    <CalendarIcon className="h-3.5 w-3.5" />
                                                    <span className="text-xs font-medium">{q.date}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col items-start text-partners-green font-black">
                                                    <div className="flex items-center gap-1">
                                                        <CurrencyIcon className="h-3.5 w-3.5" />
                                                        <span>₹{(q.amount + (q.shippingCharges || 0) + (q.taxAmount || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                                                    q.status.toLowerCase().includes('accepted') 
                                                        ? 'bg-green-100 text-green-700' 
                                                        : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {q.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAccept(q);
                                                    }}
                                                    disabled={processingId === q.estimateId || q.status.toLowerCase().includes('accepted')}
                                                    className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${
                                                        q.status.toLowerCase().includes('accepted')
                                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                            : 'bg-partners-blue text-white hover:bg-blue-600 shadow-lg shadow-blue-100'
                                                    }`}
                                                >
                                                    {processingId === q.estimateId ? 'Processing...' : 'Accept'}
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedId === q.id && (
                                            <tr className="bg-gray-50/50">
                                                <td colSpan={7} className="px-12 py-6">
                                                    <div className="bg-white rounded-2xl border border-partners-border shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="p-4 bg-gray-50 border-b border-partners-border flex justify-between items-center">
                                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                                <HashIcon className="h-3 w-3" /> Quotation Line Items
                                                            </h4>
                                                            <span className="text-[10px] font-bold text-gray-400">{q.items.length} Items</span>
                                                        </div>
                                                        <table className="w-full text-left">
                                                            <thead>
                                                                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                                                    <th className="px-6 py-3">SKU</th>
                                                                    <th className="px-6 py-3">Item Name</th>
                                                                    <th className="px-6 py-3 text-right">Rate</th>
                                                                    <th className="px-6 py-3 text-right">Qty</th>
                                                                    <th className="px-6 py-3 text-right">Total</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-50">
                                                                {q.items.map((item: QuotationItem, idx: number) => (
                                                                    <tr key={idx} className="hover:bg-gray-50/50">
                                                                        <td className="px-6 py-3 text-xs font-bold text-partners-green font-mono">{item.sku}</td>
                                                                        <td className="px-6 py-3 text-xs font-medium text-gray-700">{item.itemName}</td>
                                                                        <td className="px-6 py-3 text-xs font-bold text-gray-900 text-right">₹{item.rate.toLocaleString()}</td>
                                                                        <td className="px-6 py-3 text-xs font-bold text-gray-900 text-right">{item.quantity}</td>
                                                                        <td className="px-6 py-3 text-xs font-black text-gray-900 text-right">₹{(item.rate * item.quantity).toLocaleString()}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                            <tfoot className="bg-gray-50/50 font-black text-xs uppercase tracking-wider text-gray-400">
                                                                <tr className="border-t border-gray-100/50">
                                                                    <td colSpan={4} className="px-6 py-2 text-right">Items Subtotal</td>
                                                                    <td className="px-6 py-2 text-right text-gray-900">₹{q.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                                                </tr>
                                                                <tr>
                                                                    <td colSpan={4} className="px-6 py-2 text-right">Shipping Charges</td>
                                                                    <td className="px-6 py-2 text-right text-gray-900">₹{(q.shippingCharges || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                                                </tr>
                                                                <tr>
                                                                    <td colSpan={4} className="px-6 py-2 text-right">Tax Amount</td>
                                                                    <td className="px-6 py-2 text-right text-gray-900">₹{(q.taxAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                                                </tr>
                                                                <tr className="border-t border-gray-200">
                                                                    <td colSpan={4} className="px-6 py-4 text-right">Grand Total</td>
                                                                    <td className="px-6 py-4 text-right text-sm text-partners-green">₹{(q.amount + (q.shippingCharges || 0) + (q.taxAmount || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default QuotationsManager;
