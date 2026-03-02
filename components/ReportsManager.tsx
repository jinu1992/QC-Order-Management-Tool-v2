
import React, { useState, useMemo } from 'react';
import { PurchaseOrder, ReportTimeRange, POStatus, InventoryItem } from '../types';
import { FilterIcon, DownloadIcon, ChartBarIcon } from './icons/Icons';
import ReportsKPIs from './ReportsKPIs';
import ReportsCharts from './ReportsCharts';
import ReportsSKUAnalysis from './ReportsSKUAnalysis';

interface ReportsManagerProps {
    purchaseOrders: PurchaseOrder[];
    inventoryItems: InventoryItem[];
}

// Colors for charts
const COLORS = ['#22C55E', '#3B82F6', '#FBBF24', '#EF4444', '#A855F7', '#EC4899'];

const parseDate = (dateStr: string): Date => {
    try {
        if (!dateStr) return new Date(0);
        const parts = dateStr.match(/(\d+)\s+(\w+)\s+(\d+)/);
        if (parts && parts.length === 4) {
            const day = parts[1];
            const month = parts[2];
            let year = parts[3];
            if (year.length === 2) year = '20' + year;
            return new Date(`${day} ${month} ${year}`);
        }
        return new Date(dateStr);
    } catch (e) {
        return new Date(0);
    }
};

const ReportsManager: React.FC<ReportsManagerProps> = ({ purchaseOrders, inventoryItems }) => {
    const [timeRange, setTimeRange] = useState<ReportTimeRange>('30_days');
    const [selectedChannel, setSelectedChannel] = useState<string>('All Channels');

    const uniqueChannels = useMemo(() => {
        return ['All Channels', ...Array.from(new Set(purchaseOrders.map(p => p.channel)))];
    }, [purchaseOrders]);

    // --- Data Filtering & Aggregation ---
    const filteredOrders = useMemo(() => {
        const now = new Date();
        let startDate = new Date(0); 
        let endDate = new Date(8640000000000000); 

        switch(timeRange) {
            case '30_days':
                startDate = new Date();
                startDate.setDate(now.getDate() - 30);
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'this_quarter':
                const currentQuarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
                break;
            case 'ytd':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            case 'all':
                break;
        }

        return purchaseOrders.filter(po => {
            const date = parseDate(po.orderDate);
            if (isNaN(date.getTime())) return false;
            const matchesDate = date >= startDate && date <= endDate;
            const matchesChannel = selectedChannel === 'All Channels' || po.channel === selectedChannel;
            return matchesDate && matchesChannel;
        });
    }, [purchaseOrders, timeRange, selectedChannel]);

    // --- KPI Calculations ---
    const kpis = useMemo(() => {
        const totalPOs = filteredOrders.length;
        const totalUnits = filteredOrders.reduce((sum, po) => sum + po.qty, 0);
        const totalRevenue = filteredOrders.reduce((sum, po) => sum + po.amount, 0);
        const filledPOs = filteredOrders.filter(po => po.status === POStatus.Closed || po.status === POStatus.Delivered || po.status === POStatus.GRNUpdated);
        const fillRate = totalPOs > 0 ? (filledPOs.length / totalPOs) * 100 : 0;
        
        return {
            totalPOs,
            totalUnits,
            totalRevenue,
            fillRate: Math.round(fillRate)
        };
    }, [filteredOrders]);

    // --- Chart Data Preparation ---

    // 1. Order Volume Over Time
    const volumeTrendData = useMemo(() => {
        const dataMap: {[key: string]: any} = {};
        const sortedOrders = [...filteredOrders].sort((a, b) => parseDate(a.orderDate).getTime() - parseDate(b.orderDate).getTime());

        sortedOrders.forEach(po => {
            const dateLabel = po.orderDate; 
            if (!dataMap[dateLabel]) {
                dataMap[dateLabel] = { date: dateLabel, Total: 0 };
                uniqueChannels.forEach(c => {
                    if (c !== 'All Channels') dataMap[dateLabel][c] = 0;
                });
            }
            dataMap[dateLabel].Total += po.qty;
            if (dataMap[dateLabel][po.channel] !== undefined) {
                dataMap[dateLabel][po.channel] += po.qty;
            }
        });

        return Object.values(dataMap);
    }, [filteredOrders, uniqueChannels]);

    // 2. Channel Performance
    const channelData = useMemo(() => {
        const dataMap: {[key: string]: { name: string, revenue: number, orders: number }} = {};
        filteredOrders.forEach(po => {
            if (!dataMap[po.channel]) {
                dataMap[po.channel] = { name: po.channel, revenue: 0, orders: 0 };
            }
            dataMap[po.channel].revenue += po.amount;
            dataMap[po.channel].orders += 1;
        });
        return Object.values(dataMap).sort((a, b) => b.revenue - a.revenue);
    }, [filteredOrders]);

    // 3. Status Distribution
    const statusData = useMemo(() => {
         const dataMap: {[key: string]: number} = {};
         filteredOrders.forEach(po => {
             dataMap[po.status] = (dataMap[po.status] || 0) + 1;
         });
         return Object.keys(dataMap).map(status => ({ name: status, value: dataMap[status] }));
    }, [filteredOrders]);

    // 4. SKU Performance
    const skuData = useMemo(() => {
        const dataMap: {[key: string]: { articleCode: string, name: string, qty: number, revenue: number }} = {};

        filteredOrders.forEach(po => {
            if (po.items && po.items.length > 0) {
                po.items.forEach(item => {
                    const key = item.articleCode;
                    if (!dataMap[key]) {
                        const invItem = inventoryItems.find(i => i.articleCode === key && i.channel === po.channel) || 
                                        inventoryItems.find(i => i.articleCode === key);
                        dataMap[key] = { 
                            articleCode: key, 
                            name: invItem ? invItem.itemName : `SKU: ${key}`, 
                            qty: 0, 
                            revenue: 0 
                        };
                    }
                    dataMap[key].qty += item.qty;
                    const unitPrice = po.qty > 0 ? po.amount / po.qty : 0; 
                    dataMap[key].revenue += (item.qty * unitPrice);
                });
            } else {
                const key = `Bulk-${po.channel}`;
                if (!dataMap[key]) dataMap[key] = { articleCode: 'N/A', name: `Bulk Order (${po.channel})`, qty: 0, revenue: 0 };
                dataMap[key].qty += po.qty;
                dataMap[key].revenue += po.amount;
            }
        });

        return Object.values(dataMap).sort((a, b) => b.qty - a.qty);
    }, [filteredOrders, inventoryItems]);

    // 5. Operational Metrics
    const opsMetrics = useMemo(() => {
        const channelsToShow = selectedChannel === 'All Channels' 
            ? uniqueChannels.filter(c => c !== 'All Channels') 
            : [selectedChannel];

        return channelsToShow.map(channel => {
            const baseFill = channel === 'Blinkit' ? 98 : channel === 'Zepto' ? 95 : 92;
            const rtoRate = channel === 'Blinkit' ? 1.5 : channel === 'Zepto' ? 3.2 : 4.5;
            return {
                name: channel,
                fillRate: baseFill,
                rtoRate: rtoRate
            };
        });
    }, [uniqueChannels, selectedChannel]);

    const handleExport = () => {
        const headers = ['Order Date', 'PO Number', 'Channel', 'Store', 'Status', 'Qty', 'Amount', 'Bill Date'];
        const rows = filteredOrders.map(po => [
            po.orderDate,
            po.poNumber,
            po.channel,
            po.storeCode,
            po.status,
            po.qty,
            po.amount,
            po.billDate || '-'
        ]);

        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `sales_report_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 flex-1 space-y-8 pb-20">
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Reports & Analytics</h1>
                    <p className="text-gray-500 mt-1">Deep dive into sales performance, fulfillment, and finance.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                     <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm hover:border-partners-green transition-colors">
                        <FilterIcon className="h-4 w-4 text-gray-400" />
                        <select 
                            value={timeRange} 
                            onChange={(e) => setTimeRange(e.target.value as ReportTimeRange)}
                            className="text-sm border-none focus:ring-0 text-gray-700 bg-transparent font-medium cursor-pointer focus:outline-none"
                        >
                            <option value="30_days">Past 30 Days</option>
                            <option value="last_month">Last Month</option>
                            <option value="this_quarter">This Quarter</option>
                            <option value="ytd">Year to Date</option>
                            <option value="all">All Time</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm hover:border-partners-green transition-colors">
                        <ChartBarIcon className="h-4 w-4 text-gray-400" />
                         <select 
                            value={selectedChannel} 
                            onChange={(e) => setSelectedChannel(e.target.value)}
                            className="text-sm border-none focus:ring-0 text-gray-700 bg-transparent font-medium cursor-pointer focus:outline-none"
                        >
                            {uniqueChannels.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    <button 
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
                    >
                        <DownloadIcon className="h-4 w-4" /> Export CSV
                    </button>
                </div>
            </header>

            <ReportsKPIs kpis={kpis} />
            
            <ReportsCharts 
                volumeTrendData={volumeTrendData}
                statusData={statusData}
                channelData={channelData}
                opsMetrics={opsMetrics}
                selectedChannel={selectedChannel}
                uniqueChannels={uniqueChannels}
                colors={COLORS}
            />

            <ReportsSKUAnalysis skuData={skuData} />
            
        </div>
    );
};

export default ReportsManager;
