import React, { useState, useEffect, Fragment, useMemo, useRef } from 'react';
import { POStatus, type PurchaseOrder, POItem, InventoryItem, ChannelConfig } from '../types';
import StatusBadge from './StatusBadge';
import { 
    DotsVerticalIcon, 
    ChevronDownIcon, 
    ChevronRightIcon, 
    CloudDownloadIcon, 
    CubeIcon, 
    CheckCircleIcon, 
    XCircleIcon,
    UploadIcon, 
    InfoIcon, 
    CalendarIcon, 
    PaperclipIcon, 
    BuildingIcon, 
    RefreshIcon, 
    SearchIcon, 
    FilterIcon,
    TrashIcon,
    SortIcon,
    ClockIcon
} from './icons/Icons';
import { pushToEasyEcom, requestZohoSync, syncZohoContacts, updatePOStatus, fetchPurchaseOrder, syncSinglePO, cancelPOLineItem, manualInventoryAllocation } from '../services/api';

// --- Utilities ---

const parseDate = (dateStr: string | undefined): number => {
    try {
        if (!dateStr || dateStr.trim() === "") return 0;
        const parts = dateStr.match(/(\d+)\s+(\w+)\s+(\d+)/);
        if (parts && parts.length === 4) {
            const day = parts[1];
            const month = parts[2];
            let year = parts[3];
            if (year.length === 2) year = '20' + year;
            return new Date(`${day} ${month} ${year}`).getTime();
        }
        return new Date(dateStr).getTime() || 0;
    } catch (e) { return 0; }
};

const getCalculatedStatus = (po: PurchaseOrder): POStatus => {
    const items = po.items || [];
    const activeItems = items.filter(i => (i.itemStatus || '').toLowerCase() !== 'cancelled');
    const pushedItems = activeItems.filter(i => !!i.eeOrderRefId);
    
    const rawStatus = String(po.status || '').trim().toLowerCase();

    // 1. Check if all items are explicitly cancelled or whole PO cancelled
    const allItemsCancelled = items.length > 0 && activeItems.length === 0;
    if (allItemsCancelled || (items.length === 0 && rawStatus === 'cancelled')) return POStatus.Cancelled;
    
    // 2. Below threshold
    if (rawStatus === 'below threshold') return POStatus.BelowThreshold;

    // 3. Pushed logic (Ignoring cancelled items)
    if (activeItems.length > 0 && pushedItems.length === activeItems.length) return POStatus.Pushed;
    if (pushedItems.length > 0) return POStatus.PartiallyProcessed;

    // 4. Other workflow statuses
    if (rawStatus === 'confirmed' || rawStatus === 'confirmed to send') return POStatus.ConfirmedToSend;
    if (rawStatus === 'waiting for confirmation') return POStatus.WaitingForConfirmation;
    
    return POStatus.NewPO; 
};

// --- Sub-Components ---

interface OrderRowProps {
    po: PurchaseOrder;
    isExpanded: boolean;
    onToggle: () => void;
    isSelected: (articleCode: string) => boolean;
    onItemToggle: (articleCode: string) => void;
    onSelectAll: () => void;
    isPushing: boolean;
    onPush: () => void;
    isSyncingZoho: boolean;
    onSyncZoho: () => void;
    isSyncingEE: boolean;
    onSyncEE: () => void;
    onTrackNotify: () => void;
    onTrackNotifyDetails?: () => void;
    onCancel: () => void;
    isCancelling: boolean;
    onMarkThreshold: () => void;
    isMarkingThreshold: boolean;
    channelConfigs: ChannelConfig[];
    onUpdateStatus: (status: string) => void;
    isUpdatingStatus: boolean;
    onRefresh: () => void;
    isRefreshing: boolean;
    onCancelLineItem: (articleCode: string) => void;
    cancellingLineItemId: string | null;
}

const OrderRow: React.FC<OrderRowProps> = ({ 
    po, isExpanded, onToggle, isSelected, onItemToggle, onSelectAll, 
    isPushing, onPush, isSyncingZoho, onSyncZoho, isSyncingEE, onSyncEE, onTrackNotify, onCancel, isCancelling,
    onMarkThreshold, isMarkingThreshold, channelConfigs, onUpdateStatus, isUpdatingStatus, onRefresh, isRefreshing,
    onCancelLineItem, cancellingLineItemId
}) => {
    const poStatus = getCalculatedStatus(po);
    const items = po.items || [];
    
    // Filter active items (not cancelled)
    const activeItems = useMemo(() => items.filter(i => (i.itemStatus || '').toLowerCase() !== 'cancelled'), [items]);
    
    // Sum active quantity and active amount
    const activeTotalQty = useMemo(() => activeItems.reduce((sum, i) => sum + (i.qty || 0), 0), [activeItems]);
    const activeAmount = useMemo(() => activeItems.reduce((sum, i) => sum + ((i.qty || 0) * (i.unitCost || 0)), 0), [activeItems]);
    const amountIncTax = (activeAmount + (po.shippingCharge || 0)) * 1.05;
    
    // Calculate Fulfillable Quantity
    const totalFulfillable = activeItems.reduce((sum, item) => sum + (item.fulfillableQty || 0), 0);
    const isShortage = totalFulfillable < activeTotalQty;

    // Logic: Show Fulfillable only for New POs and Partially Pushed POs
    const showFulfillable = [
        POStatus.NewPO,
        POStatus.WaitingForConfirmation,
        POStatus.ConfirmedToSend,
        POStatus.PartiallyProcessed
    ].includes(poStatus);

    const selectableItems = items.filter(i => !i.eeOrderRefId && (i.itemStatus || '').toLowerCase() !== 'cancelled' && (i.fulfillableQty ?? 0) >= i.qty);
    const selectedCount = items.filter(i => isSelected(i.articleCode)).length;
    const effectiveDate = po.orderDate || 'N/A';

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    const handleTrashClick = (e: React.MouseEvent, articleCode: string) => {
        e.preventDefault();
        e.stopPropagation();
        
        const cleanCode = articleCode.trim();
        const isConfirmed = window.confirm(`Cancel SKU ${cleanCode} in PO ${po.poNumber}? This item will be removed from fulfillment eligibility.`);
        
        if (isConfirmed) {
            onCancelLineItem(articleCode);
        }
    };

    // Primary Action Logic
    let actionLabel = 'View Details';
    let actionColor = 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100';
    let onActionClick = onToggle;
    let isDisabled = false;

    if (poStatus === POStatus.Cancelled) {
        actionLabel = 'Cancelled';
        actionColor = 'bg-gray-100 text-gray-400 border-gray-200';
        onActionClick = () => {};
        isDisabled = true;
    } else if (poStatus === POStatus.BelowThreshold) {
        actionLabel = 'Below Threshold';
        actionColor = 'bg-orange-50 text-orange-600 border-orange-200';
        onActionClick = onToggle;
    } else if (poStatus === POStatus.Pushed) {
        actionLabel = 'Track in Sales';
        actionColor = 'bg-partners-blue text-white hover:bg-blue-700';
        onActionClick = onTrackNotify;
    } else if (!po.zohoContactId) {
        actionLabel = isSyncingZoho ? 'Syncing...' : 'Sync Zoho ID';
        actionColor = 'bg-indigo-600 text-white hover:bg-indigo-700';
        onActionClick = onSyncZoho;
        isDisabled = isSyncingZoho;
    } else if (!po.eeCustomerId) {
        actionLabel = isSyncingEE ? 'Syncing...' : 'Map to EasyEcom';
        actionColor = 'bg-blue-600 text-white hover:bg-blue-700';
        onActionClick = onSyncEE;
        isDisabled = isSyncingEE;
    } else if (poStatus === POStatus.NewPO || poStatus === POStatus.PartiallyProcessed || poStatus === POStatus.ConfirmedToSend || poStatus === POStatus.WaitingForConfirmation) {
        actionLabel = isPushing ? 'Pushing...' : 'Push to EE';
        actionColor = 'bg-partners-green text-white hover:bg-green-700';
        onActionClick = onToggle;
        isDisabled = isPushing;
    }

    const config = channelConfigs.find(c => c.channelName === po.channel);
    const actualBelowThreshold = config ? po.amount < config.minOrderThreshold : false;
    const canMarkThreshold = poStatus === POStatus.NewPO && actualBelowThreshold;

    const canCancel = (poStatus === POStatus.NewPO || poStatus === POStatus.BelowThreshold || poStatus === POStatus.WaitingForConfirmation) && selectedCount === 0;
    const canConfirm = poStatus === POStatus.NewPO || poStatus === POStatus.WaitingForConfirmation;

    return (
        <Fragment>
            <tr className={`hover:bg-gray-50/80 cursor-pointer transition-colors ${isExpanded ? 'bg-partners-light-green/30' : 'bg-white'}`} onClick={onToggle}>
                <td className="p-4 text-center sticky left-0 z-10 bg-inherit border-r border-gray-100 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                    <div className="text-gray-400">
                        {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                    </div>
                </td>
                <td className="px-6 py-4 font-bold text-partners-green whitespace-nowrap sticky left-12 z-10 bg-inherit border-r border-gray-100 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">{po.poNumber}</td>
                <td className="px-6 py-4"><StatusBadge status={poStatus} /></td>
                <td className="px-6 py-4 font-medium text-gray-700">{po.channel}</td>
                <td className="px-6 py-4 text-gray-500">{po.storeCode}</td>
                <td className="px-6 py-4">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1 font-bold">
                            {showFulfillable && (
                                <>
                                    <span className={isShortage ? 'text-red-600' : 'text-emerald-600'} title="Total Fulfillable Quantity">{totalFulfillable}</span>
                                    <span className="text-gray-300 font-normal">/</span>
                                </>
                            )}
                            <span className="text-gray-900" title="Total PO Quantity (Excl. Cancelled)">{activeTotalQty}</span>
                        </div>
                        <div className="text-[11px] font-bold text-gray-400">₹{amountIncTax.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-400">{effectiveDate}</td>
                <td className={`px-6 py-4 text-center sticky right-0 bg-white border-l border-gray-100 shadow-[-2px_0_4px_rgba(0,0,0,0.02)] ${isMenuOpen ? 'z-50' : 'z-30'}`} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-3 min-w-[200px]">
                        {canMarkThreshold && (
                            <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onMarkThreshold(); }}
                                disabled={isMarkingThreshold}
                                className="px-2 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg transition-all border border-orange-100"
                                title={`Move to Below Threshold (Limit: ₹${config?.minOrderThreshold})`}
                            >
                                {isMarkingThreshold ? <RefreshIcon className="h-4 w-4 animate-spin"/> : <SortIcon className="h-4 w-4 rotate-90"/>}
                            </button>
                        )}
                        <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onActionClick(); }}
                            disabled={isDisabled || isCancelling || isUpdatingStatus}
                            className={`flex-1 min-w-[100px] px-3 py-2 text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95 whitespace-nowrap overflow-hidden text-ellipsis ${actionColor} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {actionLabel}
                        </button>
                        <div className="relative flex-shrink-0" ref={menuRef}>
                            <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
                                className={`text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors ${isMenuOpen ? 'bg-gray-100 text-gray-600' : ''}`}
                            >
                                <DotsVerticalIcon className="h-5 w-5" />
                            </button>
                            
                            {isMenuOpen && (
                                <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-2xl border border-gray-100 z-[100] overflow-hidden ring-1 ring-black/5">
                                    <div className="py-1">
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onToggle(); }}
                                            className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                                        >
                                            <InfoIcon className="h-4 w-4" /> View Details
                                        </button>
                                        
                                        {canConfirm && (
                                            <>
                                                <button 
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onUpdateStatus('Confirmed'); }}
                                                    disabled={isUpdatingStatus}
                                                    className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-partners-green hover:bg-green-50 flex items-center gap-2 border-t border-gray-50"
                                                >
                                                    <CheckCircleIcon className="h-4 w-4" /> Confirm Order
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onUpdateStatus('Waiting for Confirmation'); }}
                                                    disabled={isUpdatingStatus}
                                                    className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-yellow-600 hover:bg-yellow-50 flex items-center gap-2"
                                                >
                                                    <ClockIcon className="h-4 w-4" /> Mark Waiting
                                                </button>
                                            </>
                                        )}

                                        {canMarkThreshold && (
                                            <button 
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onMarkThreshold(); }}
                                                className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-orange-600 hover:bg-orange-50 flex items-center gap-2"
                                            >
                                                <SortIcon className="h-4 w-4 rotate-90" /> Mark Below Threshold
                                            </button>
                                        )}

                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onRefresh(); }}
                                            disabled={isRefreshing}
                                            className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-2 border-t border-gray-50"
                                        >
                                            <RefreshIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} /> {isRefreshing ? 'Syncing...' : 'Targeted Sync (Fast)'}
                                        </button>

                                        {canCancel && (
                                            <button 
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onCancel(); }}
                                                disabled={isCancelling}
                                                className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-50 disabled:opacity-50"
                                            >
                                                <TrashIcon className="h-4 w-4" /> {isCancelling ? 'Cancelling...' : 'Cancel PO'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </td>
            </tr>
            {isExpanded && (
                <tr className="bg-gray-50/50">
                    <td colSpan={8} className="px-4 py-8 sm:px-12">
                        <div className="bg-white border border-partners-border rounded-xl p-6 space-y-6 shadow-sm ring-1 ring-black/5">
                            <div className="pb-6 border-b border-gray-100">
                                <div className="flex justify-between items-start mb-4">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-blue-500" /> Fulfillment Ref</h4>
                                    <button 
                                        type="button"
                                        onClick={onRefresh}
                                        disabled={isRefreshing}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                                    >
                                        <RefreshIcon className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                                        {isRefreshing ? 'Refreshing...' : 'Refresh This Order Only'}
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">PO Ref</p><p className="text-xs font-bold text-partners-green truncate">{po.poNumber}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">PO Date</p><p className="text-xs font-bold text-gray-700">{po.orderDate || 'N/A'}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Shipping Chg</p><p className="text-xs font-bold text-gray-900">{typeof po.shippingCharge === 'number' ? `₹${po.shippingCharge}` : '₹0'}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">EasyEcom Cust ID</p><p className={`text-xs font-bold ${po.eeCustomerId ? 'text-blue-600' : 'text-red-500 italic'}`}>{po.eeCustomerId || 'Not Mapped'}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">Expiry Date</p><p className="text-xs font-bold text-red-600">{po.poExpiryDate || 'N/A'}</p></div>
                                    <div><p className="text-[10px] uppercase font-bold text-gray-400">PO PDF</p>{po.poPdfUrl ? <a href={po.poPdfUrl} target="_blank" rel="noopener noreferrer" className="text-partners-green hover:underline flex items-center gap-1 text-xs font-bold mt-0.5"><PaperclipIcon className="h-3 w-3" /> View PO PDF</a> : <p className="text-xs text-gray-300 font-bold italic mt-0.5">Not Uploaded</p>}</div>
                                </div>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2"><CubeIcon className="h-4 w-4 text-partners-green" /> Item List & Stock Status</h4>
                                <div className="flex items-center gap-3">
                                     <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-100">{selectableItems.length} Ready to Push</span>
                                </div>
                            </div>
                            <div className="overflow-x-auto border border-gray-100 rounded-lg">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-gray-50 text-gray-500 uppercase tracking-tight">
                                        <tr>
                                            <th className="py-3 w-8 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    className="h-3.5 w-3.5 rounded border-gray-300 text-partners-green focus:ring-partners-green cursor-pointer disabled:opacity-30" 
                                                    checked={selectableItems.length > 0 && selectedCount === selectableItems.length} 
                                                    onChange={onSelectAll} 
                                                    disabled={selectableItems.length === 0 || poStatus === POStatus.Cancelled || isPushing}
                                                />
                                            </th>
                                            <th className="py-3 px-3">Item Name / SKU</th>
                                            <th className="py-3 text-right">PO Qty</th>
                                            <th className="py-3 text-right">Fulfillable</th>
                                            <th className="py-3 px-3 text-center">Price Check</th>
                                            <th className="py-3 text-right">Unit Cost (Inc. 5% Tax)</th>
                                            <th className="py-3 text-center min-w-[140px]">Status / Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {items.map((item, idx) => {
                                            const isPushed = !!item.eeOrderRefId;
                                            const isCancelled = (item.itemStatus || '').toLowerCase() === 'cancelled';
                                            const isFullyFulfillable = (item.fulfillableQty ?? 0) >= item.qty;
                                            const unitPriceIncTax = ((item.unitCost || 0) * 1.05).toFixed(2);
                                            const checked = isSelected(item.articleCode);
                                            const cleanCode = item.articleCode.trim();
                                            const lineId = `${po.poNumber}-${cleanCode}`;
                                            const isProcessingLine = cancellingLineItemId === lineId;
                                            
                                            return (
                                                <tr key={`${po.id}-item-${idx}`} className={`${isPushed ? 'bg-gray-50/50' : 'hover:bg-gray-50/30'} ${!isPushed && !isFullyFulfillable && !isCancelled ? 'bg-orange-50/20' : ''} ${isCancelled ? 'bg-red-50/30 grayscale' : ''}`}>
                                                    <td className="py-4 text-center">
                                                        {isPushed ? (
                                                            <CheckCircleIcon className="h-5 w-5 text-green-500 mx-auto" />
                                                        ) : isCancelled ? (
                                                            <XCircleIcon className="h-5 w-5 text-red-300 mx-auto" />
                                                        ) : (
                                                            <input 
                                                                type="checkbox" 
                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-partners-green focus:ring-partners-green cursor-pointer" 
                                                                checked={checked} 
                                                                onChange={() => onItemToggle(item.articleCode)} 
                                                                disabled={!isFullyFulfillable || poStatus === POStatus.Cancelled || isPushing}
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="py-4 px-3">
                                                        <div className="flex flex-col">
                                                            <p className={`font-bold ${isPushed || isCancelled ? 'text-gray-400' : 'text-gray-800'}`}>{item.itemName}</p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <p className="text-[10px] text-gray-400 truncate max-w-[150px] font-mono">{item.masterSku || item.articleCode}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 text-right font-medium">{item.qty}</td>
                                                    <td className={`py-4 text-right font-bold ${isFullyFulfillable ? 'text-green-600' : 'text-red-600'}`}>{item.fulfillableQty ?? '0'}</td>
                                                    <td className="py-4 px-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${item.priceCheckStatus === 'Mismatch' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                                                            {item.priceCheckStatus || 'OK'}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 text-right font-bold">₹{unitPriceIncTax}</td>
                                                    <td className="py-4 text-center">
                                                        <div className="flex items-center justify-center gap-3">
                                                            {isPushed ? (
                                                                <span className="text-[9px] font-bold text-green-700 bg-green-100/50 px-2 py-0.5 rounded border border-green-200 uppercase">Pushed</span>
                                                            ) : isCancelled ? (
                                                                <span className="text-[9px] font-bold text-red-700 bg-red-100/50 px-2 py-0.5 rounded border border-green-200 uppercase">Cancelled</span>
                                                            ) : poStatus === POStatus.Cancelled ? (
                                                                <span className="text-[9px] font-bold text-red-700 uppercase">Cancelled</span>
                                                            ) : poStatus === POStatus.BelowThreshold ? (
                                                                <span className="text-[9px] font-bold text-orange-700 uppercase">Below Threshold</span>
                                                            ) : (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-gray-400 text-[10px] font-bold uppercase tracking-tight">Pending</span>
                                                                    <button 
                                                                        type="button"
                                                                        onClick={(e) => handleTrashClick(e, cleanCode)}
                                                                        disabled={isPushing || isProcessingLine}
                                                                        className="relative z-[60] p-2 text-red-500 bg-red-50 hover:text-white hover:bg-red-500 rounded-lg transition-all shadow-sm active:scale-90 flex items-center justify-center border border-red-100 cursor-pointer pointer-events-auto"
                                                                        title="Cancel this SKU"
                                                                    >
                                                                        {isProcessingLine ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex justify-end pt-4 border-t border-gray-100">
                                {po.eeCustomerId ? (
                                    <button 
                                        type="button"
                                        onClick={onPush} 
                                        disabled={selectedCount === 0 || isPushing || poStatus === POStatus.BelowThreshold || poStatus === POStatus.Cancelled} 
                                        className={`flex items-center gap-2 px-6 py-3 text-sm font-bold text-white rounded-xl shadow-sm transition-all active:scale-95 ${selectedCount > 0 && !isPushing ? 'bg-partners-green hover:bg-green-700' : 'bg-gray-300 cursor-not-allowed grayscale'}`}
                                    >
                                        <UploadIcon className="h-4 w-4" />
                                        {isPushing ? 'Processing...' : `Push ${selectedCount > 0 ? selectedCount : ''} Items`}
                                    </button>
                                ) : po.zohoContactId ? (
                                    <button 
                                        type="button"
                                        onClick={onSyncEE} 
                                        disabled={isSyncingEE}
                                        className={`flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm active:scale-95 transition-all ${isSyncingEE ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <RefreshIcon className={`h-4 w-4 ${isSyncingEE ? 'animate-spin' : ''}`} />
                                        {isSyncingEE ? 'Syncing EE...' : 'Map to EasyEcom'}
                                    </button>
                                ) : (
                                    <button 
                                        type="button"
                                        onClick={onSyncZoho} 
                                        disabled={isSyncingZoho}
                                        className={`flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm active:scale-95 transition-all ${isSyncingZoho ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <RefreshIcon className={`h-4 w-4 ${isSyncingZoho ? 'animate-spin' : ''}`} />
                                        {isSyncingZoho ? 'Syncing Zoho...' : 'Sync Zoho Contacts'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </Fragment>
    );
};

// --- Main Component ---

interface PoTableProps {
    activeFilter: string;
    setActiveFilter: (filter: string) => void;
    purchaseOrders: PurchaseOrder[];
    setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
    tabCounts: { [key: string]: number };
    addLog: (action: string, details: string) => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    onSync: () => void;
    isSyncing: boolean;
    inventoryItems?: InventoryItem[];
    channelConfigs: ChannelConfig[];
}

const PoTable: React.FC<PoTableProps> = ({ 
    activeFilter, setActiveFilter, purchaseOrders, setPurchaseOrders, tabCounts, onSync, isSyncing, addLog, addNotification, channelConfigs
}) => {
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [selectedPoItems, setSelectedPoItems] = useState<{ [key: string]: string[] }>({});
    const [pushingToEasyEcom, setPushingToEasyEcom] = useState<{ [key: string]: boolean }>({});
    const [cancellingPoId, setCancellingPoId] = useState<string | null>(null);
    const [markingThresholdId, setMarkingThresholdId] = useState<string | null>(null);
    const [syncingZohoId, setSyncingZohoId] = useState<string | null>(null);
    const [syncingEEId, setSyncingEEId] = useState<string | null>(null);
    const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
    const [refreshingPoId, setRefreshingPoId] = useState<string | null>(null);
    const [cancellingLineItemId, setCancellingLineItemId] = useState<string | null>(null);
    const [isAllocating, setIsAllocating] = useState(false);

    const [skuSearch, setSkuSearch] = useState('');
    const [debouncedSkuSearch, setDebouncedSkuSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSkuSearch(skuSearch);
        }, 300);
        return () => clearTimeout(timer);
    }, [skuSearch]);

    const [columnFilters, setColumnFilters] = useState<{ [key: string]: string }>({});
    const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
    const filterMenuRef = useRef<HTMLDivElement>(null);

    const tabs = [
        { name: 'New POs' }, { name: 'Below Threshold POs' }, { name: 'Pushed POs' }, { name: 'Partially Pushed POs' }, { name: 'Cancelled POs' }, { name: 'All POs' }
    ];

    const uniqueChannels = useMemo(() => Array.from(new Set(purchaseOrders.map(p => p.channel))), [purchaseOrders]);

    const processedOrders = useMemo(() => {
        let orders = [...purchaseOrders];
        if (activeFilter !== 'All POs') {
            orders = orders.filter(po => {
                const status = getCalculatedStatus(po);
                if (activeFilter === 'New POs') return status === POStatus.NewPO || status === POStatus.ConfirmedToSend || status === POStatus.WaitingForConfirmation;
                if (activeFilter === 'Below Threshold POs') return status === POStatus.BelowThreshold;
                if (activeFilter === 'Pushed POs') return status === POStatus.Pushed;
                if (activeFilter === 'Partially Pushed POs') return status === POStatus.PartiallyProcessed;
                if (activeFilter === 'Cancelled POs') return status === POStatus.Cancelled;
                return true;
            });
        }
        Object.keys(columnFilters).forEach(key => {
            const val = columnFilters[key].toLowerCase();
            if (!val) return;
            orders = orders.filter(po => String((po as any)[key] || '').toLowerCase().includes(val));
        });

        if (activeFilter === 'New POs' && debouncedSkuSearch.trim()) {
            const search = debouncedSkuSearch.toLowerCase().trim();
            orders = orders.filter(po => 
                (po.items || []).some(item => 
                    (item.masterSku || '').toLowerCase().includes(search) || 
                    (item.articleCode || '').toLowerCase().includes(search) ||
                    (item.itemName || '').toLowerCase().includes(search)
                )
            );
        }
        
        orders.sort((a, b) => {
            const dateA = parseDate(a.orderDate);
            const dateB = parseDate(b.orderDate);
            return dateB - dateA;
        });
        return orders;
    }, [activeFilter, purchaseOrders, columnFilters, debouncedSkuSearch]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setActiveFilterColumn(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const refreshSinglePOState = async (poNumber: string) => {
        setRefreshingPoId(poNumber);
        try {
            const res = await syncSinglePO(poNumber);
            const updatedPO = await fetchPurchaseOrder(poNumber);
            if (updatedPO) {
                setPurchaseOrders(prev => prev.map(p => p.poNumber === poNumber ? updatedPO : p));
                addNotification(res.message || `Refreshed ${poNumber} successfully`, 'success');
            } else {
                addNotification(`Could not find ${poNumber} in database`, 'error');
            }
        } catch (e: any) {
            console.error("Failed to fetch updated single PO", e);
            addNotification(e.message || 'Network error', 'error');
        } finally {
            setRefreshingPoId(null);
        }
    };

    const handleItemToggle = (poId: string, articleCode: string) => {
        setSelectedPoItems(prev => {
            const current = prev[poId] || [];
            const isSelected = current.includes(articleCode);
            return { 
                ...prev, 
                [poId]: isSelected ? current.filter(c => c !== articleCode) : [...current, articleCode] 
            };
        });
    };

    const handleSelectAll = (po: PurchaseOrder) => {
        const selectable = (po.items || [])
            .filter(i => !i.eeOrderRefId && (i.itemStatus || '').toLowerCase() !== 'cancelled' && (i.fulfillableQty ?? 0) >= i.qty)
            .map(i => i.articleCode);
        const current = selectedPoItems[po.id] || [];
        const allSelected = selectable.length > 0 && current.length === selectable.length;
        setSelectedPoItems(prev => ({ ...prev, [po.id]: allSelected ? [] : selectable }));
    };

    const handlePushAction = async (po: PurchaseOrder) => {
        const selected = selectedPoItems[po.id] || [];
        if (selected.length === 0) return;
        setPushingToEasyEcom(prev => ({ ...prev, [po.id]: true }));
        try {
            const res = await pushToEasyEcom(po, selected);
            if (res.status === 'success') {
                setPurchaseOrders(prev => prev.map(p => {
                    if (p.poNumber === po.poNumber) {
                        return {
                            ...p,
                            items: p.items?.map(item => 
                                selected.includes(item.articleCode) 
                                    ? { ...item, eeOrderRefId: 'PATCHED' }
                                    : item
                            )
                        };
                    }
                    return p;
                }));

                addNotification(res.message || 'Pushed to EasyEcom successfully.', 'success');
                addLog('EasyEcom Sync', `Pushed ${selected.length} items from PO ${po.poNumber}`);
                setSelectedPoItems(prev => ({ ...prev, [po.id]: [] }));
                refreshSinglePOState(po.poNumber);
            } else { addNotification('Failed: ' + res.message, 'error'); }
        } catch (e) { addNotification('Network error.', 'error'); }
        finally { setPushingToEasyEcom(prev => ({ ...prev, [po.id]: false })); }
    };

    const handleCancelLineItemAction = async (po: PurchaseOrder, articleCode: string) => {
        if (!articleCode) return;
        
        const cleanCode = articleCode.trim();
        const lineId = `${po.poNumber}-${cleanCode}`;
        setCancellingLineItemId(lineId);
        
        console.log(`[HANDLING-CANCEL] Processing SKU ${cleanCode} for PO ${po.poNumber}`);
        
        try {
            const res = await cancelPOLineItem(po.poNumber, cleanCode);
            
            if (res.status === 'success') {
                setPurchaseOrders(prev => {
                    const freshArray = prev.map(p => {
                        if (p.poNumber === po.poNumber) {
                            const updatedItems = (p.items || []).map(item => {
                                if (item.articleCode.trim() === cleanCode) {
                                    return { ...item, itemStatus: 'Cancelled' };
                                }
                                return item;
                            });
                            return { ...p, items: updatedItems };
                        }
                        return p;
                    });
                    return [...freshArray];
                });
                
                addNotification(res.message || `Item ${cleanCode} cancelled.`, 'success');
                addLog('Line Item Cancelled', `SKU ${cleanCode} in PO ${po.poNumber} marked as Cancelled`);
                
                setTimeout(() => refreshSinglePOState(po.poNumber), 500);
            } else {
                addNotification('Cancellation Failed: ' + res.message, 'error');
            }
        } catch (e: any) {
            console.error(`[HANDLING-CANCEL] API Error:`, e);
            addNotification('Error: ' + (e.message || 'Network failure'), 'error');
        } finally {
            setCancellingLineItemId(null);
        }
    };

    const handleSyncZohoContactsAction = async (po: PurchaseOrder) => {
        setSyncingZohoId(po.id);
        try {
            const res = await syncZohoContacts();
            if (res.status === 'success') {
                addNotification(res.message || 'Zoho contacts sync initiated.', 'success');
                refreshSinglePOState(po.poNumber);
            } else { addNotification(`Error: ${res.message || 'Unknown error'}`, 'error'); }
        } catch (e) { addNotification('Sync Exception.', 'error'); }
        finally { setSyncingZohoId(null); }
    };

    const handleSyncEEAction = async (po: PurchaseOrder) => {
        if (!po.zohoContactId) { addNotification('Missing Zoho Contact ID.', 'warning'); return; }
        setSyncingEEId(po.id);
        try {
            const res = await requestZohoSync(po.zohoContactId);
            if (res.status === 'success') {
                addNotification(res.message || 'Customer mapped to EasyEcom successfully.', 'success');
                refreshSinglePOState(po.poNumber);
            } else { addNotification(`Error: ${res.message || 'Unknown error'}`, 'error'); }
        } catch (e) { addNotification('EE Sync Exception.', 'error'); }
        finally { setSyncingEEId(null); }
    };

    const handleThresholdAction = async (po: PurchaseOrder) => {
        setMarkingThresholdId(po.id);
        try {
            const res = await updatePOStatus(po.poNumber, 'Below Threshold');
            if (res.status === 'success') {
                setPurchaseOrders(prev => prev.map(p => 
                    p.poNumber === po.poNumber ? { ...p, status: 'Below Threshold' as any } : p
                ));
                addNotification(res.message || `PO ${po.poNumber} marked as Below Threshold.`, 'success');
                addLog('Threshold Update', `Moved PO ${po.poNumber} to Below Threshold`);
                refreshSinglePOState(po.poNumber);
            } else { addNotification('Update Failed: ' + res.message, 'error'); }
        } catch (e) { addNotification('Network error.', 'error'); }
        finally { setMarkingThresholdId(null); }
    };

    const handleCancelPoAction = async (po: PurchaseOrder) => {
        if (!window.confirm(`Are you sure you want to cancel PO ${po.poNumber}?`)) return;
        setCancellingPoId(po.id);
        try {
            const res = await updatePOStatus(po.poNumber, 'Cancelled');
            if (res.status === 'success') {
                setPurchaseOrders(prev => prev.map(p => 
                    p.poNumber === po.poNumber ? { ...p, status: 'Cancelled' as any } : p
                ));
                addNotification(res.message || `PO ${po.poNumber} cancelled successfully.`, 'success');
                addLog('Cancel PO', `Marked PO ${po.poNumber} as Cancelled`);
                refreshSinglePOState(po.poNumber);
            } else { addNotification('Cancel Failed: ' + res.message, 'error'); }
        } catch (e) { addNotification('Network error.', 'error'); }
        finally { setCancellingPoId(null); }
    };

    const handleUpdateStatusAction = async (po: PurchaseOrder, newStatus: string) => {
        setUpdatingStatusId(po.id);
        try {
            const res = await updatePOStatus(po.poNumber, newStatus);
            if (res.status === 'success') {
                setPurchaseOrders(prev => prev.map(p => 
                    p.poNumber === po.poNumber ? { ...p, status: newStatus as any } : p
                ));
                addNotification(res.message || `PO ${po.poNumber} updated to ${newStatus}.`, 'success');
                addLog('Status Update', `Manually updated PO ${po.poNumber} to ${newStatus}`);
                refreshSinglePOState(po.poNumber);
            } else { addNotification('Update Failed: ' + res.message, 'error'); }
        } catch (e) { addNotification('Network error.', 'error'); }
        finally { setUpdatingStatusId(null); }
    };

    const handleManualAllocation = async () => {
        setIsAllocating(true);
        addNotification('Triggering manual inventory allocation...', 'info');
        try {
            const res = await manualInventoryAllocation();
            if (res.status === 'success') {
                addNotification(res.message || 'Inventory allocated successfully.', 'success');
                addLog('Inventory Allocation', 'Manual allocation triggered for New POs.');
                onSync(); // Refresh global data to update fulfillment numbers
            } else {
                addNotification('Allocation Failed: ' + (res.message || 'Unknown error'), 'error');
            }
        } catch (e) {
            addNotification('Network error during allocation.', 'error');
        } finally {
            setIsAllocating(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div className="flex flex-wrap items-center gap-2">
                    {tabs.map(tab => (
                        <button key={tab.name} onClick={() => setActiveFilter(tab.name)}
                            className={`px-3 py-1.5 text-sm font-semibold rounded-full border transition-colors ${
                                activeFilter === tab.name ? 'bg-partners-green text-white border-partners-green shadow-sm' : 'bg-white text-gray-600 border-partners-border hover:bg-gray-50'
                            }`}
                        >
                            {tab.name} {tabCounts[tab.name] > 0 && <span className="ml-1 text-[10px] opacity-70">({tabCounts[tab.name]})</span>}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    {activeFilter === 'New POs' && (
                        <div className="relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input 
                                type="text"
                                placeholder="Filter by SKU..."
                                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-partners-green focus:border-transparent outline-none w-48 md:w-64 transition-all"
                                value={skuSearch}
                                onChange={(e) => setSkuSearch(e.target.value)}
                            />
                        </div>
                    )}
                    {activeFilter === 'New POs' && (
                        <button 
                            type="button" 
                            onClick={handleManualAllocation} 
                            disabled={isAllocating || isSyncing} 
                            className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg shadow-sm hover:bg-emerald-100 active:scale-95 transition-all"
                        >
                            <CubeIcon className={`h-4 w-4 ${isAllocating ? 'animate-pulse' : ''}`} /> 
                            {isAllocating ? 'Allocating...' : 'Allocate Inventory'}
                        </button>
                    )}
                    <button type="button" onClick={onSync} disabled={isSyncing} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 active:scale-95 transition-all">
                        <CloudDownloadIcon className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} /> Sync All Data
                    </button>
                </div>
            </div>

            <div className="mt-6 overflow-x-auto border border-gray-100 rounded-xl shadow-inner max-h-[70vh]">
                <table className="w-full text-sm text-left text-gray-600 border-collapse">
                    <thead className="text-[11px] text-gray-500 uppercase bg-gray-50/95 border-b border-gray-100 sticky top-0 z-20">
                        <tr>
                            <th className="p-4 w-4 sticky left-0 bg-gray-50 z-30 border-r border-gray-100"></th>
                            <th className="px-6 py-4 sticky left-12 bg-gray-50 z-30 border-r border-gray-100 min-w-[150px]">
                                <div className="flex items-center gap-2">
                                    PO Number
                                    <button type="button" onClick={() => setActiveFilterColumn(activeFilterColumn === 'poNumber' ? null : 'poNumber')} className={`p-1 rounded hover:bg-gray-200 ${columnFilters.poNumber ? 'text-partners-green' : 'text-gray-400'}`}><SearchIcon className="h-3 w-3"/></button>
                                </div>
                                {activeFilterColumn === 'poNumber' && (
                                    <div ref={filterMenuRef} className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 p-2 z-40 normal-case">
                                        <input type="text" autoFocus placeholder="Search PO..." className="w-full px-3 py-1.5 text-xs border rounded-md focus:ring-1 focus:ring-partners-green" value={columnFilters.poNumber || ''} onChange={(e) => setColumnFilters({...columnFilters, poNumber: e.target.value})} />
                                    </div>
                                )}
                            </th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 min-w-[140px]">
                                <div className="flex items-center gap-2">Channel <button type="button" onClick={() => setActiveFilterColumn('channel')} className="p-1"><FilterIcon className="h-3 w-3"/></button></div>
                                {activeFilterColumn === 'channel' && (
                                    <div ref={filterMenuRef} className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 p-2 z-40 normal-case">
                                        <select className="w-full px-2 py-1.5 text-xs border rounded-md" value={columnFilters.channel || ''} onChange={(e) => setColumnFilters({...columnFilters, channel: e.target.value})}>
                                            <option value="">All</option>
                                            {uniqueChannels.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                )}
                            </th>
                            <th className="px-6 py-4">Store</th>
                            <th className="px-6 py-4">Fulfillable / Qty / Total</th>
                            <th className="px-6 py-4">PO Date</th>
                            <th className="px-6 py-4 text-center sticky right-0 bg-gray-50 z-30 border-l border-gray-100 min-w-[200px]">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {processedOrders.length === 0 ? (
                            <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400 italic">No purchase orders found.</td></tr>
                        ) : (
                            processedOrders.map((po) => (
                                <OrderRow 
                                    key={po.id}
                                    po={po}
                                    isExpanded={expandedRowId === po.id}
                                    onToggle={() => setExpandedRowId(expandedRowId === po.id ? null : po.id)}
                                    isSelected={(code) => (selectedPoItems[po.id] || []).includes(code)}
                                    onItemToggle={(code) => handleItemToggle(po.id, code)}
                                    onSelectAll={() => handleSelectAll(po)}
                                    isPushing={!!pushingToEasyEcom[po.id]}
                                    onPush={() => handlePushAction(po)}
                                    isSyncingZoho={syncingZohoId === po.id}
                                    onSyncZoho={() => handleSyncZohoContactsAction(po)}
                                    isSyncingEE={syncingEEId === po.id}
                                    onSyncEE={() => handleSyncEEAction(po)}
                                    onTrackNotify={() => addNotification('Navigate to Sales Orders to track fulfillment.', 'info')}
                                    onCancel={() => handleCancelPoAction(po)}
                                    isCancelling={cancellingPoId === po.id}
                                    onMarkThreshold={() => handleThresholdAction(po)}
                                    isMarkingThreshold={markingThresholdId === po.id}
                                    channelConfigs={channelConfigs}
                                    onUpdateStatus={(s) => handleUpdateStatusAction(po, s)}
                                    isUpdatingStatus={updatingStatusId === po.id}
                                    onRefresh={() => refreshSinglePOState(po.poNumber)}
                                    isRefreshing={refreshingPoId === po.poNumber}
                                    onCancelLineItem={(code) => handleCancelLineItemAction(po, code)}
                                    cancellingLineItemId={cancellingLineItemId}
                                />
                            ))
                        )}
                        <tr className="h-32"><td colSpan={8} className="bg-white"></td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PoTable;