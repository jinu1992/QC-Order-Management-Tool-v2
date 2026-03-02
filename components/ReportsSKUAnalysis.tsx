
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CubeIcon } from './icons/Icons';

interface ReportsSKUAnalysisProps {
    skuData: any[];
}

const ReportsSKUAnalysis: React.FC<ReportsSKUAnalysisProps> = ({ skuData }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Products Table */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <CubeIcon className="h-5 w-5 text-partners-green" /> Top Selling SKUs
                    </h3>
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">by Volume</span>
                </div>
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-sm text-left text-gray-600">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-4 py-3">Product Name</th>
                                <th className="px-4 py-3 text-right">Units</th>
                                <th className="px-4 py-3 text-right">Revenue (Est)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {skuData.slice(0, 5).map((sku, index) => (
                                <tr key={index} className="border-b hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900 truncate max-w-xs" title={sku.name}>{sku.name}</p>
                                        <p className="text-xs text-gray-500 font-mono">{sku.articleCode}</p>
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-gray-800">{sku.qty}</td>
                                    <td className="px-4 py-3 text-right text-green-600">₹{sku.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                </tr>
                            ))}
                            {skuData.length === 0 && (
                                <tr><td colSpan={3} className="text-center py-8 text-gray-500 italic">No SKU data available for this selection</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Top SKUs Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Top 5 SKUs by Volume</h3>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={skuData.slice(0, 5)} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                            <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                            <YAxis dataKey="articleCode" type="category" axisLine={false} tickLine={false} width={80} tick={{fill: '#374151', fontSize: 11, fontWeight: 500}} />
                            <Tooltip 
                                cursor={{fill: 'transparent'}}
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-white p-2 border border-gray-200 shadow-md rounded text-xs">
                                            <p className="font-bold mb-1">{payload[0].payload.name}</p>
                                            <p className="text-yellow-600 font-semibold">Units: {payload[0].value}</p>
                                        </div>
                                    );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey="qty" name="Units Sold" fill="#F59E0B" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default ReportsSKUAnalysis;
