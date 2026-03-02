import React, { useState, useMemo } from 'react';
import { InventoryItem, PurchaseOrder, POStatus } from '../types';
import { SearchIcon, RefreshIcon, PlusIcon, CheckCircleIcon, XCircleIcon, PencilIcon } from './icons/Icons';
import { createInventoryItem, updateInventoryPrice, syncInventoryFromEasyEcom } from '../services/api';

interface InventoryManagerProps {
    addLog: (action: string, details: string) => void;
    inventoryItems: InventoryItem[];
    purchaseOrders: PurchaseOrder[];
    setInventoryItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
    onSync: () => void;
    isSyncing: boolean;
    activeTab: 'mapping' | 'shortfall';
    setActiveTab: (tab: 'mapping' | 'shortfall') => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const inputClassName = "mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 shadow-sm focus:border-partners-green focus:ring-partners-green sm:text-sm py-3 px-3";

const CreateItemModal = ({ onClose, onSave, uniqueChannels }: { onClose: () => void, onSave: (data: any) => void, uniqueChannels: string[] }) => {
    const [formData, setFormData] = useState({
        channel: uniqueChannels[0] || 'Blinkit',
        articleCode: '',
        sku: '',
        spIncTax: ''
    });

    const handleSubmit = () => {
        if (!formData.articleCode || !formData.sku || !formData.spIncTax) return;
        onSave({ ...formData, spIncTax: parseFloat(formData.spIncTax) });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Create New Inventory Mapping</h3>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Channel</label>
                        <select 
                            className={inputClassName}
                            value={formData.channel}
                            onChange={e => setFormData({...formData, channel: e.target.value})}
                        >
                            <option value="Blinkit">Blinkit</option>
                            <option value="Zepto">Zepto</option>
                            <option value="Swiggy Instamart">Swiggy Instamart</option>
                            <option value="Flipkart Minutes">Flipkart Minutes</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Channel SKU (Article Code)</label>
                        <input type="text" className={inputClassName} value={formData.articleCode} onChange={e => setFormData({...formData, articleCode: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Master SKU</label>
                        <input type="text" className={inputClassName} value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Selling Price</label>
                        <input type="number" className={inputClassName} value={formData.spIncTax} onChange={e => setFormData({...formData, spIncTax: e.target.value})} />
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-partners-green border border-transparent rounded-md hover:bg-green-700">Create</button>
                </div>
            </div>
        </div>
    );
};

const InventoryManager: React.FC<InventoryManagerProps> = ({ addLog, inventoryItems, purchaseOrders, setInventoryItems, onSync, isSyncing, activeTab, setActiveTab, addNotification }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedChannel, setSelectedChannel] = useState<string>('All Channels');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isInternalSyncing, setIsInternalSyncing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editPrice, setEditPrice] = useState<string>('');

    // --- REFINED Shortfall Analysis: Item-Level Status Check ---
    const { shortfallData, shortfallChannels } = useMemo(() => {
        const demandMap: Record<string, { 
            sku: string, 
            itemName: string, 
            totalRequired: number, 
            channelDemand: Record<string, number> 
        }> = {};
        
        const activeChannels = new Set<string>();
        // Statuses of interest at the ROW/ITEM level
        const targetStatuses = ['New', 'Confirmed'];

        purchaseOrders.forEach(po => {
            // Note: We no longer return early based on po.status
            // because individual items within a PO can have different row-level statuses.
            
            (po.items || []).forEach(item => {
                const itemStatus = String(item.itemStatus || 'New').trim();
                const isCancelled = itemStatus.toLowerCase() === 'cancelled';
                
                // Requirement: Status as New or Confirmed AND not pushed to EE
                const isTargetStatus = targetStatuses.includes(itemStatus);
                const isNotPushed = !item.eeReferenceCode || String(item.eeReferenceCode).trim() === "";
                
                if (isTargetStatus && isNotPushed && !isCancelled) {
                    const sku = String(item.masterSku || item.articleCode).trim();
                    if (!sku) return;

                    const qty = item.qty || 0;
                    const channel = po.channel || 'Unknown';
                    activeChannels.add(channel);

                    if (!demandMap[sku]) {
                        demandMap[sku] = { 
                            sku, 
                            itemName: item.itemName || 'N/A', 
                            totalRequired: 0, 
                            channelDemand: {} 
                        };
                    }
                    demandMap[sku].totalRequired += qty;
                    demandMap[sku].channelDemand[channel] = (demandMap[sku].channelDemand[channel] || 0) + qty;
                }
            });
        });

        // Cross-reference demand with Inventory stock
        const results = Object.values(demandMap).map(demand => {
            // Get current stock for this SKU
            const inv = inventoryItems.find(i => String(i.sku).trim() === demand.sku);
            const stock = inv?.stock || 0;
            const shortfall = Math.max(0, demand.totalRequired - stock);

            return {
                ...demand,
                stock,
                shortfall
            };
        }).filter(item => item.shortfall > 0)
          .sort((a, b) => b.shortfall - a.shortfall);

        return {
            shortfallData: results,
            shortfallChannels: Array.from(activeChannels).sort()
        };
    }, [inventoryItems, purchaseOrders]);

    const inventoryStats = useMemo(() => ({
        totalMappings: inventoryItems.length,
        lowStockCount: inventoryItems.filter(i => i.stock < 50).length,
        totalShortfallUnits: shortfallData.reduce((acc, item) => acc + item.shortfall, 0),
        shortfallSkus: shortfallData.length
    }), [inventoryItems, shortfallData]);

    const filteredInventory = useMemo(() => {
        return inventoryItems.filter(item => {
            const matchesSearch = (item.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 (item.itemName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 (item.articleCode || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesChannel = selectedChannel === 'All Channels' || item.channel === selectedChannel;
            return matchesSearch && matchesChannel;
        });
    }, [inventoryItems, searchQuery, selectedChannel]);

    const filteredShortfall = useMemo(() => {
        return shortfallData.filter(item => 
            item.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
            item.itemName.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [shortfallData, searchQuery]);

    const uniqueChannels = useMemo(() => ['All Channels', ...Array.from(new Set(inventoryItems.map(item => item.channel)))], [inventoryItems]);

    const handleInternalSync = async () => {
        setIsInternalSyncing(true);
        addLog('Inventory Sync', 'Manual stock sync started...');
        try {
            const result = await syncInventoryFromEasyEcom();
            if (result.status === 'success') {
                onSync();
                addNotification(result.message || 'Inventory stock sync completed.', 'success');
            }
            else addNotification('Sync failed: ' + result.message, 'error');
        } catch (e) { addLog('Sync Error', 'Network failure'); }
        finally { setIsInternalSyncing(false); }
    };

    const handleCreateItem = async (newItem: any) => {
        setShowCreateModal(false);
        try {
            const res = await createInventoryItem(newItem);
            if (res.status === 'success') {
                onSync();
                addNotification(res.message || 'Mapping created successfully.', 'success');
            } else {
                addNotification(res.message || 'Failed to create mapping.', 'error');
            }
        } catch (e) { 
            console.error(e);
            addNotification('Error creating mapping.', 'error');
        }
    };

    const savePrice = async (item: InventoryItem) => {
        if (!editPrice) return;
        const newPrice = parseFloat(editPrice);
        setEditingId(null);
        try {
            const res = await updateInventoryPrice(item.channel, item.articleCode, newPrice);
            if (res.status === 'success') {
                setInventoryItems(prev => prev.map(i => i.id === item.id ? { ...i, spIncTax: newPrice } : i));
                addNotification(res.message || 'Price updated successfully.', 'success');
            } else {
                addNotification(res.message || 'Failed to update price.', 'error');
            }
        } catch (e) { 
            addNotification('Price update failed', 'error');
        }
    };

    const totalLoading = isSyncing || isInternalSyncing;

    return (
        <div className="p-4 sm:p-6 lg:p-8 flex-1 space-y-6">
            {showCreateModal && <CreateItemModal onClose={() => setShowCreateModal(false)} onSave={handleCreateItem} uniqueChannels={uniqueChannels.filter(c => c !== 'All Channels')} />}

            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Inventory & Mapping</h1>
                    <p className="text-gray-500 mt-1">Manage SKU mappings and track procurement gaps from un-pushed row items.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"><PlusIcon className="h-4 w-4" /> New Mapping</button>
                    <button onClick={handleInternalSync} disabled={totalLoading} className={`flex items-center gap-2 px-4 py-2.5 bg-partners-green text-white font-bold rounded-lg hover:bg-green-700 transition-colors shadow-sm ${totalLoading ? 'opacity-75 cursor-wait' : ''}`}><RefreshIcon className={`h-4 w-4 ${totalLoading ? 'animate-spin' : ''}`} /> {totalLoading ? 'Syncing...' : 'Sync Stock'}</button>
                </div>
            </header>

            <div className="flex gap-6 border-b border-gray-200">
                <button onClick={() => setActiveTab('mapping')} className={`pb-3 text-sm font-bold transition-all border-b-2 px-2 ${activeTab === 'mapping' ? 'border-partners-green text-partners-green' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Item Mappings ({inventoryStats.totalMappings})</button>
                <button onClick={() => setActiveTab('shortfall')} className={`pb-3 text-sm font-bold transition-all border-b-2 px-2 flex items-center gap-2 ${activeTab === 'shortfall' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Shortfall Analysis {inventoryStats.shortfallSkus > 0 && <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full border border-red-200">{inventoryStats.shortfallSkus}</span>}</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-blue-500"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Mappings</p><p className="text-2xl font-black text-gray-800 mt-1">{inventoryStats.totalMappings}</p></div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-amber-500"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Low Stock</p><p className="text-2xl font-black text-amber-600 mt-1">{inventoryStats.lowStockCount}</p></div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-red-500"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Shortfall Units</p><p className="text-2xl font-black text-red-600 mt-1">{inventoryStats.totalShortfallUnits}</p></div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-purple-500"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Shortfall SKUs</p><p className="text-2xl font-black text-purple-600 mt-1">{inventoryStats.shortfallSkus}</p></div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
                    <div className="relative flex-1 max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon className="h-4 w-4 text-gray-400" /></div>
                        <input type="text" placeholder="Search Master SKU or Item..." className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-partners-green sm:text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {activeTab === 'mapping' ? (
                        <table className="w-full text-sm text-left text-gray-600">
                            <thead className="text-[11px] text-gray-400 uppercase bg-gray-50 border-b border-gray-200 font-bold tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Channel</th>
                                    <th className="px-6 py-4">Article Code</th>
                                    <th className="px-6 py-4">Master SKU</th>
                                    <th className="px-6 py-4">Item Name</th>
                                    <th className="px-6 py-4 text-right">MRP</th>
                                    <th className="px-6 py-4 text-right">Stock</th>
                                    <th className="px-6 py-4 text-right">Selling Price</th>
                                    <th className="px-6 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredInventory.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4"><span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase border ${item.channel === 'Blinkit' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' : item.channel === 'Zepto' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{item.channel}</span></td>
                                        <td className="px-6 py-4 font-mono text-xs text-gray-400">{item.articleCode}</td>
                                        <td className="px-6 py-4 font-bold text-gray-900">{item.sku}</td>
                                        <td className="px-6 py-4"><div className="text-sm font-medium text-gray-900 line-clamp-1">{item.itemName}</div><div className="text-[10px] text-gray-400 font-mono mt-0.5">{item.ean}</div></td>
                                        <td className="px-6 py-4 text-right text-gray-400">₹{item.mrp}</td>
                                        <td className="px-6 py-4 text-right font-bold text-gray-700">{item.stock}</td>
                                        <td className="px-6 py-4 text-right font-bold text-blue-800">{editingId === item.id ? <input type="number" className="w-20 p-1 border rounded text-right font-bold text-sm" value={editPrice} onChange={e => setEditPrice(e.target.value)} autoFocus /> : `₹${item.spIncTax}`}</td>
                                        <td className="px-6 py-4 text-right">{editingId === item.id ? <div className="flex justify-end gap-2"><button onClick={() => setEditingId(null)}><XCircleIcon className="h-5 w-5 text-gray-400"/></button><button onClick={() => savePrice(item)}><CheckCircleIcon className="h-5 w-5 text-green-500"/></button></div> : <button onClick={() => { setEditingId(item.id); setEditPrice(item.spIncTax.toString()); }} className="text-gray-400 hover:text-blue-600"><PencilIcon className="h-4 w-4"/></button>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-sm text-left text-gray-600">
                            <thead className="text-[11px] text-gray-400 uppercase bg-gray-50 border-b border-gray-200 font-bold tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 bg-gray-50 sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">Master SKU / Item</th>
                                    <th className="px-6 py-4 text-right">Current Stock</th>
                                    {shortfallChannels.map(channel => (
                                        <th key={channel} className="px-6 py-4 text-right whitespace-nowrap">{channel} Req</th>
                                    ))}
                                    <th className="px-6 py-4 text-right font-bold text-gray-900 bg-gray-50/50">Total Required</th>
                                    <th className="px-6 py-4 text-right text-red-600 font-black">Final Shortfall</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredShortfall.length === 0 ? (
                                    <tr><td colSpan={shortfallChannels.length + 4} className="px-6 py-12 text-center text-gray-400 italic">No shortfall detected for un-pushed items in New/Confirmed status.</td></tr>
                                ) : (
                                    filteredShortfall.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-red-50/10 transition-colors">
                                            <td className="px-6 py-4 bg-white sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
                                                <div className="font-bold text-gray-900">{item.sku}</div>
                                                <div className="text-[10px] text-gray-400 line-clamp-1">{item.itemName}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-blue-600 bg-blue-50/10">{item.stock}</td>
                                            {shortfallChannels.map(channel => (
                                                <td key={channel} className={`px-6 py-4 text-right font-bold ${item.channelDemand[channel] ? 'text-gray-700' : 'text-gray-200'}`}>
                                                    {item.channelDemand[channel] || 0}
                                                </td>
                                            ))}
                                            <td className="px-6 py-4 text-right font-bold text-gray-900 bg-gray-50/30">
                                                {item.totalRequired}
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-red-600 text-base bg-red-50/30">
                                                {item.shortfall}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase flex justify-between items-center tracking-widest">
                    <span>{activeTab === 'mapping' ? `Count: ${filteredInventory.length}` : `Count: ${filteredShortfall.length} SKUs contributing to shortfall`}</span>
                    <span>Last Updated: {new Date().toLocaleTimeString()}</span>
                </div>
            </div>
        </div>
    );
};

export default InventoryManager;