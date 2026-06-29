import React, { useState, useEffect } from 'react';
import { networkInterceptor, NetworkLog } from '../services/networkInterceptor';
import { 
    CheckCircleIcon, 
    XCircleIcon, 
    SearchIcon, 
    TrashIcon, 
    DownloadIcon, 
    RefreshIcon,
    ChevronRightIcon,
    InfoIcon
} from './icons/Icons';

const NotificationsManager: React.FC = () => {
    const [logs, setLogs] = useState<NetworkLog[]>([]);
    const [selectedLog, setSelectedLog] = useState<NetworkLog | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [methodFilter, setMethodFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    useEffect(() => {
        // Subscribe to interceptor logs
        const unsubscribe = networkInterceptor.subscribe((newLogs) => {
            setLogs([...newLogs]);
        });
        return () => unsubscribe();
    }, []);

    // Filter and search logic
    const filteredLogs = logs.filter(log => {
        const matchesSearch = 
            log.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (log.requestBody && JSON.stringify(log.requestBody).toLowerCase().includes(searchQuery.toLowerCase())) ||
            (log.responseBody && JSON.stringify(log.responseBody).toLowerCase().includes(searchQuery.toLowerCase())) ||
            (log.errorMessage && log.errorMessage.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesMethod = methodFilter === 'ALL' || log.method.toUpperCase() === methodFilter.toUpperCase();
        const matchesStatus = statusFilter === 'ALL' || log.status === statusFilter.toLowerCase();

        return matchesSearch && matchesMethod && matchesStatus;
    });

    // Counts for KPIs
    const totalCount = logs.length;
    const successCount = logs.filter(l => l.status === 'success').length;
    const failedCount = logs.filter(l => l.status === 'failed').length;
    const pendingCount = logs.filter(l => l.status === 'pending').length;

    // Simulation helpers
    const handleSimulateSuccess = async () => {
        try {
            await fetch('https://jsonplaceholder.typicode.com/posts/1');
        } catch (e) {
            console.error('Simulated success failed', e);
        }
    };

    const handleSimulateFailure = async () => {
        try {
            // Fetching a non-existent page/URL to trigger an error
            await fetch('https://httpstat.us/500?sleep=1000', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trigger: 'manual_simulation', action: 'fail' })
            });
        } catch (e) {
            console.error('Simulated failure caught', e);
        }
    };

    const handleSimulateNetworkError = async () => {
        try {
            // Fetching an invalid host to trigger actual network failure
            await fetch('https://invalid.domain.cubelelo.com/api/test');
        } catch (e) {
            console.error('Simulated network error caught', e);
        }
    };

    const handleClearLogs = () => {
        networkInterceptor.clearLogs();
        setSelectedLog(null);
    };

    const handleExportLogs = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `network_process_logs_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    // Helper to get method style
    const getMethodBadgeClass = (method: string) => {
        const m = method.toUpperCase();
        if (m === 'GET') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (m === 'POST') return 'bg-blue-50 text-blue-700 border-blue-200';
        if (m === 'PUT' || m === 'PATCH') return 'bg-amber-50 text-amber-700 border-amber-200';
        if (m === 'DELETE') return 'bg-rose-50 text-rose-700 border-rose-200';
        return 'bg-gray-50 text-gray-700 border-gray-200';
    };

    const cleanUrlDisplay = (urlStr: string) => {
        try {
            const url = new URL(urlStr);
            return url.pathname + url.search;
        } catch (e) {
            return urlStr;
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50 p-4 sm:p-6 lg:p-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Total Requests</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{totalCount}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl text-gray-500">
                        <InfoIcon className="h-6 w-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">Success</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{successCount}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-500">
                        <CheckCircleIcon className="h-6 w-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-rose-500">Failed</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{failedCount}</p>
                    </div>
                    <div className="p-3 bg-rose-50 rounded-xl text-rose-500">
                        <XCircleIcon className="h-6 w-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-500">Pending</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{pendingCount}</p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-xl text-amber-500 flex items-center justify-center">
                        <RefreshIcon className="h-6 w-6 animate-spin-slow" />
                    </div>
                </div>
            </div>

            {/* Filter and Simulator Actions */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Search & Filters */}
                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <SearchIcon className="h-4 w-4" />
                        </span>
                        <input
                            type="text"
                            placeholder="Search URL, payload, parameters..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-partners-green focus:border-transparent bg-gray-50/50"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase">Method</span>
                        <select
                            value={methodFilter}
                            onChange={(e) => setMethodFilter(e.target.value)}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-partners-green bg-white text-gray-700 font-medium"
                        >
                            <option value="ALL">All Methods</option>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase">Status</span>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-partners-green bg-white text-gray-700 font-medium"
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="SUCCESS">Success</option>
                            <option value="FAILED">Failed</option>
                            <option value="PENDING">Pending</option>
                        </select>
                    </div>
                </div>

                {/* Simulation & Operations Actions */}
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleSimulateSuccess}
                        className="px-3 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-colors"
                        title="Fires a successful HTTP GET request to JSONPlaceholder"
                    >
                        + Simulate Success
                    </button>
                    <button
                        onClick={handleSimulateFailure}
                        className="px-3 py-2 text-xs font-bold text-amber-600 bg-amber-50 rounded-xl border border-amber-100 hover:bg-amber-100 transition-colors"
                        title="Fires a failing HTTP POST request to httpstat.us"
                    >
                        + Simulate 500
                    </button>
                    <button
                        onClick={handleSimulateNetworkError}
                        className="px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 rounded-xl border border-rose-100 hover:bg-rose-100 transition-colors"
                        title="Fires a fetch request to a broken domain to test DNS / Network failure visualization"
                    >
                        + Simulate Network Error
                    </button>
                    <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>
                    <button
                        onClick={handleExportLogs}
                        disabled={logs.length === 0}
                        className="p-2 text-gray-500 hover:text-partners-green hover:bg-gray-100 rounded-xl border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Export logs as JSON file"
                    >
                        <DownloadIcon className="h-4 w-4" />
                    </button>
                    <button
                        onClick={handleClearLogs}
                        disabled={logs.length === 0}
                        className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Clear captured log history"
                    >
                        <TrashIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Layout split: Main list & Drawer details */}
            <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
                {/* Logs List Pane */}
                <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0 overflow-hidden">
                    <div className="overflow-x-auto overflow-y-auto flex-1">
                        <table className="min-w-full divide-y divide-gray-150 text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/75 border-b border-gray-150">
                                    <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Method</th>
                                    <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Path / Endpoint</th>
                                    <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Time</th>
                                    <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Status</th>
                                    <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Duration</th>
                                    <th className="relative px-6 py-3.5 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            <p className="font-bold text-base">No network logs captured yet</p>
                                            <p className="text-xs text-gray-400 mt-1">Try navigating the dashboard, refreshing tables, or using the simulation buttons above!</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <tr 
                                            key={log.id} 
                                            onClick={() => setSelectedLog(log)}
                                            className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedLog?.id === log.id ? 'bg-partners-light-green/30' : ''}`}
                                        >
                                            <td className="px-6 py-3.5 whitespace-nowrap">
                                                <span className={`inline-block px-2.5 py-1 text-xs font-bold border rounded-lg uppercase ${getMethodBadgeClass(log.method)}`}>
                                                    {log.method}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3.5 font-medium text-gray-700 break-all" title={log.url}>
                                                {cleanUrlDisplay(log.url)}
                                            </td>
                                            <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-500">
                                                {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(log.timestamp.getMilliseconds()).padStart(3, '0')}
                                            </td>
                                            <td className="px-6 py-3.5 whitespace-nowrap">
                                                {log.status === 'success' && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                        {log.statusCode || 'OK'}
                                                    </span>
                                                )}
                                                {log.status === 'failed' && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                        {log.statusCode || 'FAIL'}
                                                    </span>
                                                )}
                                                {log.status === 'pending' && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                                                        <RefreshIcon className="h-3 w-3 animate-spin text-amber-500" />
                                                        Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-500">
                                                {log.duration !== undefined ? `${log.duration} ms` : '-'}
                                            </td>
                                            <td className="px-6 py-3.5 text-right text-gray-400">
                                                <ChevronRightIcon className="h-4 w-4" />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Details Side Panel/Drawer */}
                {selectedLog && (
                    <div className="w-full lg:w-[450px] xl:w-[500px] bg-white rounded-2xl border border-gray-100 shadow-lg flex flex-col min-h-0 overflow-hidden">
                        {/* Header */}
                        <div className="p-4 border-b border-gray-150 bg-gray-50/75 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-800 text-base">Request Details</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">ID: {selectedLog.id}</p>
                            </div>
                            <button 
                                onClick={() => setSelectedLog(null)}
                                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 p-1.5 rounded-lg transition-colors"
                            >
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Scrollable details */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {/* General */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">General Information</h4>
                                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 space-y-2">
                                    <div className="flex justify-between items-start gap-4">
                                        <span className="text-xs font-bold text-gray-500">Request URL:</span>
                                        <div className="text-right">
                                            <span className="text-xs font-mono text-gray-800 break-all select-all font-bold block">{selectedLog.url}</span>
                                            <button 
                                                onClick={() => copyToClipboard(selectedLog.url)}
                                                className="text-[10px] text-partners-green font-bold hover:underline mt-1 focus:outline-none"
                                            >
                                                Copy URL
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-gray-500">HTTP Method:</span>
                                        <span className={`px-2 py-0.5 text-[10px] font-bold border rounded-md uppercase ${getMethodBadgeClass(selectedLog.method)}`}>
                                            {selectedLog.method}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-gray-500">Triggered At:</span>
                                        <span className="text-gray-800 font-medium">{selectedLog.timestamp.toLocaleString()}</span>
                                    </div>
                                    {selectedLog.duration !== undefined && (
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-gray-500">Response Duration:</span>
                                            <span className="text-gray-800 font-medium">{selectedLog.duration} ms</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-gray-500">Status Status:</span>
                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                                            selectedLog.status === 'success' ? 'bg-emerald-50 text-emerald-700' :
                                            selectedLog.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                                        }`}>
                                            {selectedLog.status}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Failure Box */}
                            {selectedLog.status === 'failed' && (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500">Failure Details</h4>
                                    <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl text-xs text-rose-700 space-y-1">
                                        <p className="font-bold">Error Reason:</p>
                                        <p className="font-mono bg-white/70 p-2 border border-rose-200/50 rounded-lg break-words mt-1 leading-relaxed">
                                            {selectedLog.errorMessage || 'Unknown Connection Interruption.'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Request Payload */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Request Body / Payload</h4>
                                <div className="bg-gray-900 text-gray-300 p-3.5 rounded-xl border border-gray-800 font-mono text-xs overflow-x-auto max-h-[220px]">
                                    {selectedLog.requestBody ? (
                                        typeof selectedLog.requestBody === 'object' ? (
                                            <pre className="text-emerald-400">{JSON.stringify(selectedLog.requestBody, null, 2)}</pre>
                                        ) : (
                                            <pre className="text-blue-400 whitespace-pre-wrap">{selectedLog.requestBody}</pre>
                                        )
                                    ) : (
                                        <span className="text-gray-500 italic">[No Request Body / Payload sent]</span>
                                    )}
                                </div>
                            </div>

                            {/* Response Payload */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Response Payload (What was fetched)</h4>
                                <div className="bg-gray-900 text-gray-300 p-3.5 rounded-xl border border-gray-800 font-mono text-xs overflow-x-auto max-h-[350px]">
                                    {selectedLog.status === 'pending' ? (
                                        <div className="flex items-center gap-2 text-gray-500 py-2">
                                            <RefreshIcon className="h-4 w-4 animate-spin text-amber-500" />
                                            <span>Waiting for fetch execution details...</span>
                                        </div>
                                    ) : selectedLog.responseBody ? (
                                        typeof selectedLog.responseBody === 'object' ? (
                                            <pre className="text-amber-400">{JSON.stringify(selectedLog.responseBody, null, 2)}</pre>
                                        ) : (
                                            <pre className="text-sky-400 whitespace-pre-wrap">{selectedLog.responseBody}</pre>
                                        )
                                    ) : (
                                        <span className="text-gray-500 italic">[No response body returned from server]</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsManager;
