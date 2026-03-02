import React from 'react';
import { ActivityLog } from '../types';

interface AdminLogsProps {
    logs: ActivityLog[];
}

const AdminLogs: React.FC<AdminLogsProps> = ({ logs }) => {
    return (
        <div className="p-4 sm:p-6 lg:p-8 flex-1">
            <header>
                <h1 className="text-2xl font-bold text-gray-800">Activity Logs</h1>
                <p className="text-gray-500 mt-1">Audit trail of all user actions within the system.</p>
            </header>
            <div className="mt-6 bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-600">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">Timestamp</th>
                                <th className="px-6 py-3">User</th>
                                <th className="px-6 py-3">Action</th>
                                <th className="px-6 py-3">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                        No activity recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                logs.map(log => (
                                    <tr key={log.id} className="border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{log.timestamp}</td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{log.user}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{log.details}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminLogs;
