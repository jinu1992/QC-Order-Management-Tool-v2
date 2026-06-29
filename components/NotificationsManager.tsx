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
    const [isDeveloperMode, setIsDeveloperMode] = useState(false); // Defaults to Human/User Mode

    useEffect(() => {
        const unsubscribe = networkInterceptor.subscribe((newLogs) => {
            setLogs([...newLogs]);
        });
        return () => unsubscribe();
    }, []);

    // Filter and search logic
    const filteredLogs = logs.filter(log => {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
            log.url.toLowerCase().includes(query) ||
            (log.displayName && log.displayName.toLowerCase().includes(query)) ||
            (log.displayDescription && log.displayDescription.toLowerCase().includes(query)) ||
            (log.dataSummary && log.dataSummary.toLowerCase().includes(query)) ||
            (log.requestBody && JSON.stringify(log.requestBody).toLowerCase().includes(query)) ||
            (log.responseBody && JSON.stringify(log.responseBody).toLowerCase().includes(query)) ||
            (log.errorMessage && log.errorMessage.toLowerCase().includes(query));

        const matchesMethod = methodFilter === 'ALL' || log.method.toUpperCase() === methodFilter.toUpperCase();
        const matchesStatus = statusFilter === 'ALL' || log.status === statusFilter.toLowerCase();

        return matchesSearch && matchesMethod && matchesStatus;
    });

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
        downloadAnchor.setAttribute("download", `process_activity_logs_${Date.now()}.json`);
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
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Total Actions</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{totalCount}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl text-gray-500">
                        <InfoIcon className="h-6 w-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">Completed</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{successCount}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-500">
                        <CheckCircleIcon className="h-6 w-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-rose-500">Failed / Alert</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{failedCount}</p>
                    </div>
                    <div className="p-3 bg-rose-50 rounded-xl text-rose-500">
                        <XCircleIcon className="h-6 w-6" />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-500">Processing</p>
                        <p className="text-2xl font-bold text-gray-800 mt-1">{pendingCount}</p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-xl text-amber-500 flex items-center justify-center">
                        <RefreshIcon className="h-6 w-6 animate-spin-slow" />
                    </div>
                </div>
            </div>

            {/* Filter and Simulator Actions */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                {/* Search & Filters */}
                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <SearchIcon className="h-4 w-4" />
                        </span>
                        <input
                            type="text"
                            placeholder={isDeveloperMode ? "Search URL, payload, parameters..." : "Search action or summaries..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-partners-green focus:border-transparent bg-gray-50/50"
                        />
                    </div>

                    {isDeveloperMode && (
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
                    )}

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase">Status</span>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-partners-green bg-white text-gray-700 font-medium"
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="SUCCESS">{isDeveloperMode ? "Success (OK)" : "Completed"}</option>
                            <option value="FAILED">{isDeveloperMode ? "Failed (Error)" : "Failed"}</option>
                            <option value="PENDING">Processing</option>
                        </select>
                    </div>

                    {/* Mode Toggle Switch */}
                    <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200/50">
                        <button
                            onClick={() => setIsDeveloperMode(false)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                !isDeveloperMode 
                                    ? 'bg-white text-partners-green shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-900'
                            }`}
                        >
                            User Mode
                        </button>
                        <button
                            onClick={() => setIsDeveloperMode(true)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                isDeveloperMode 
                                    ? 'bg-white text-partners-green shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-900'
                            }`}
                        >
                            Developer Mode
                        </button>
                    </div>
                </div>

                {/* Simulation & Operations Actions */}
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleSimulateSuccess}
                        className="px-3 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-colors"
                        title="Simulate loading sample data successfully"
                    >
                        + Simulate Success
                    </button>
                    <button
                        onClick={handleSimulateFailure}
                        className="px-3 py-2 text-xs font-bold text-amber-600 bg-amber-50 rounded-xl border border-amber-100 hover:bg-amber-100 transition-colors"
                        title="Simulate a server returning an internal error code"
                    >
                        + Simulate Server Error
                    </button>
                    <button
                        onClick={handleSimulateNetworkError}
                        className="px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 rounded-xl border border-rose-100 hover:bg-rose-100 transition-colors"
                        title="Simulate internet connectivity / offline failure"
                    >
                        + Simulate Network Outage
                    </button>
                    <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>
                    <button
                        onClick={handleExportLogs}
                        disabled={logs.length === 0}
                        className="p-2 text-gray-500 hover:text-partners-green hover:bg-gray-100 rounded-xl border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Export log sheet"
                    >
                        <DownloadIcon className="h-4 w-4" />
                    </button>
                    <button
                        onClick={handleClearLogs}
                        disabled={logs.length === 0}
                        className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Reset history"
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
                                    {isDeveloperMode ? (
                                        <>
                                            <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Method</th>
                                            <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Path / Endpoint</th>
                                            <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Time</th>
                                            <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Status</th>
                                            <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Duration</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-56">Action Triggered</th>
                                            <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">What happened</th>
                                            <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Trigger Time</th>
                                            <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-28">State</th>
                                        </>
                                    )}
                                    <th className="relative px-6 py-3.5 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={isDeveloperMode ? 6 : 5} className="px-6 py-12 text-center text-gray-500">
                                            <p className="font-bold text-base">No actions captured yet</p>
                                            <p className="text-xs text-gray-400 mt-1">Navigate around the portal or click the simulation buttons to test.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <tr 
                                            key={log.id} 
                                            onClick={() => setSelectedLog(log)}
                                            className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedLog?.id === log.id ? 'bg-partners-light-green/30' : ''}`}
                                        >
                                            {isDeveloperMode ? (
                                                <>
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
                                                                {log.statusCode || 'OK'}
                                                            </span>
                                                        )}
                                                        {log.status === 'failed' && (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
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
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-6 py-3.5 whitespace-nowrap text-sm font-bold text-gray-800">
                                                        {log.displayName || 'Unknown Process'}
                                                    </td>
                                                    <td className="px-6 py-3.5 text-sm text-gray-600 break-words max-w-md font-medium">
                                                        {log.dataSummary || 'Executing...'}
                                                    </td>
                                                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-400 font-medium">
                                                        {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </td>
                                                    <td className="px-6 py-3.5 whitespace-nowrap">
                                                        {log.status === 'success' && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-full">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                Completed
                                                            </span>
                                                        )}
                                                        {log.status === 'failed' && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-rose-700 bg-rose-50 rounded-full">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                                Failed
                                                            </span>
                                                        )}
                                                        {log.status === 'pending' && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-amber-700 bg-amber-50 rounded-full">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                                                Running
                                                            </span>
                                                        )}
                                                    </td>
                                                </>
                                            )}
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
                                <h3 className="font-bold text-gray-800 text-base">
                                    {isDeveloperMode ? "Developer Technical Details" : "Action Summary"}
                                </h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Reference ID: {selectedLog.id}</p>
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
                            {!isDeveloperMode ? (
                                /* Human Mode Details */
                                <div className="space-y-5">
                                    <div>
                                        <h4 className="text-2xl font-bold text-gray-800">{selectedLog.displayName || 'Action Details'}</h4>
                                        <p className="text-sm text-gray-500 mt-1 font-medium">{selectedLog.displayDescription || 'Unrecognized portal process.'}</p>
                                    </div>

                                    {/* Action Status Status */}
                                    <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50 space-y-3">
                                        <div className="flex justify-between items-center text-sm border-b border-gray-200/50 pb-2">
                                            <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">Current State:</span>
                                            <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full uppercase ${
                                                selectedLog.status === 'success' ? 'bg-emerald-50 text-emerald-700' :
                                                selectedLog.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                                            }`}>
                                                {selectedLog.status === 'success' ? 'Success' : selectedLog.status === 'failed' ? 'Failed' : 'In Progress'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-gray-200/50 pb-2">
                                            <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">Time Triggered:</span>
                                            <span className="text-gray-700 font-bold">{selectedLog.timestamp.toLocaleTimeString()} ({selectedLog.timestamp.toLocaleDateString()})</span>
                                        </div>
                                        {selectedLog.duration !== undefined && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">Time Elapsed:</span>
                                                <span className="text-gray-700 font-bold">{selectedLog.duration / 1000 >= 1 ? `${(selectedLog.duration / 1000).toFixed(2)} seconds` : `${selectedLog.duration} milliseconds`}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Simplified Plain-English Description of Data Fetched */}
                                    <div className="space-y-2">
                                        <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Results / Synced Data</h5>
                                        <div className={`p-4 rounded-2xl border text-sm font-semibold leading-relaxed ${
                                            selectedLog.status === 'success' ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' :
                                            selectedLog.status === 'failed' ? 'bg-rose-50/50 border-rose-100 text-rose-800' : 'bg-amber-50/50 border-amber-100 text-amber-800'
                                        }`}>
                                            {selectedLog.dataSummary || 'Waiting for process to return data...'}
                                        </div>
                                    </div>

                                    {selectedLog.status === 'failed' && (
                                        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 space-y-2 text-xs text-rose-700">
                                            <p className="font-bold text-sm">⚠️ Troubleshooting Notice</p>
                                            <p className="leading-relaxed font-medium">
                                                The process could not complete successfully. This is commonly caused by an API timeout or an internet connection interruption. 
                                                You can click the <strong>Sync / Refresh</strong> button on the dashboard to try again, or contact support if the issue persists.
                                            </p>
                                        </div>
                                    )}
                                    
                                    {/* Expandable Advanced Area */}
                                    <details className="group border border-gray-150 rounded-xl bg-gray-50/50 overflow-hidden">
                                        <summary className="px-4 py-3 text-xs font-bold text-gray-500 cursor-pointer list-none flex justify-between items-center group-open:bg-gray-100 hover:bg-gray-100 select-none">
                                            <span>🔍 Show Technical Developer Logs</span>
                                            <ChevronRightIcon className="h-4 w-4 group-open:rotate-90 transition-transform duration-200" />
                                        </summary>
                                        <div className="p-4 border-t border-gray-150 bg-white space-y-4">
                                            <div className="text-xs space-y-1">
                                                <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px] block">Raw Endpoint URL:</span>
                                                <span className="font-mono text-gray-800 break-all select-all font-semibold block">{selectedLog.url}</span>
                                            </div>
                                            <div className="text-xs space-y-1">
                                                <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px] block">HTTP Status:</span>
                                                <span className="font-mono text-gray-700 font-bold">{selectedLog.statusCode || 'N/A'}</span>
                                            </div>
                                            {selectedLog.requestBody && (
                                                <div className="text-xs space-y-1">
                                                    <span className="font-bold text-gray-400 uppercase tracking-wider text-[9px] block">Request Payload:</span>
                                                    <pre className="bg-gray-900 text-emerald-400 p-2.5 rounded-lg font-mono text-[10px] overflow-auto max-h-[150px]">
                                                        {JSON.stringify(selectedLog.requestBody, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                </div>
                            ) : (
                                /* Developer Mode Details */
                                <div className="space-y-5">
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
                                                <span className="font-bold text-gray-500">Status State:</span>
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
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsManager;
