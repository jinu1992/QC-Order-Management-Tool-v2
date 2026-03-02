
import React from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { TrendingUpIcon, TrendingDownIcon, TruckIcon } from './icons/Icons';

interface ReportsChartsProps {
    volumeTrendData: any[];
    statusData: any[];
    channelData: any[];
    opsMetrics: any[];
    selectedChannel: string;
    uniqueChannels: string[];
    colors: string[];
}

const ReportsCharts: React.FC<ReportsChartsProps> = ({ 
    volumeTrendData, statusData, channelData, opsMetrics, 
    selectedChannel, uniqueChannels, colors 
}) => {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Volume Trend - Multi Line for Channel breakdown */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Order Volume Trend (Units)</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={volumeTrendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                                <Tooltip 
                                    contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}} 
                                    itemStyle={{fontSize: '12px', fontWeight: 600}}
                                />
                                <Legend />
                                {selectedChannel === 'All Channels' ? (
                                    uniqueChannels.filter(c => c !== 'All Channels').map((channel, index) => (
                                        <Line 
                                            key={channel}
                                            type="monotone" 
                                            dataKey={channel} 
                                            stroke={colors[index % colors.length]} 
                                            strokeWidth={2} 
                                            dot={{r: 3}} 
                                            activeDot={{r: 5}} 
                                        />
                                    ))
                                ) : (
                                    <Line type="monotone" dataKey="Total" stroke="#22C55E" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Order Status Distribution</h3>
                    <div className="h-64 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue by Channel */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Revenue by Channel</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={channelData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{fill: '#374151', fontSize: 13, fontWeight: 500}} />
                                <Tooltip cursor={{fill: 'transparent'}} />
                                <Bar dataKey="revenue" name="Revenue (₹)" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Operational Metrics */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Operational Efficiency</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={opsMetrics} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                                <YAxis yAxisId="left" orientation="left" stroke="#10B981" />
                                <YAxis yAxisId="right" orientation="right" stroke="#EF4444" />
                                <Tooltip />
                                <Legend />
                                <Bar yAxisId="left" dataKey="fillRate" name="Fill Rate %" fill="#10B981" radius={[4, 4, 0, 0]} barSize={30} />
                                <Bar yAxisId="right" dataKey="rtoRate" name="RTO Rate %" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={30} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Insights Summary */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
                <h3 className="text-lg font-bold text-indigo-900 mb-2">Key Insights</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex gap-3">
                        <div className="mt-1"><TrendingDownIcon className="h-5 w-5 text-red-500" /></div>
                        <div>
                            <p className="font-semibold text-gray-800">Fill Rate Alert</p>
                            <p className="text-sm text-gray-600">Zepto fill rate has dropped by 3% this week. Check inventory for top 5 SKUs.</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <div className="mt-1"><TrendingUpIcon className="h-5 w-5 text-green-500" /></div>
                        <div>
                            <p className="font-semibold text-gray-800">Revenue Growth</p>
                            <p className="text-sm text-gray-600">Blinkit order volume is at an all-time high, contributing 45% of total revenue.</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <div className="mt-1"><TruckIcon className="h-5 w-5 text-blue-500" /></div>
                        <div>
                            <p className="font-semibold text-gray-800">RTO Reduction</p>
                            <p className="text-sm text-gray-600">RTO rate has improved by 1.2% after new packaging guidelines were implemented.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportsCharts;
