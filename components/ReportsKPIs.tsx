
import React from 'react';
import { ClipboardListIcon, TruckIcon, CurrencyIcon, PieChartIcon, TrendingUpIcon, TrendingDownIcon } from './icons/Icons';

interface ReportsKPIsProps {
    kpis: {
        totalPOs: number;
        totalUnits: number;
        totalRevenue: number;
        fillRate: number;
    };
}

const ReportsKPIs: React.FC<ReportsKPIsProps> = ({ kpis }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm text-gray-500">Total POs Received</p>
                        <p className="text-3xl font-bold text-gray-800 mt-2">{kpis.totalPOs}</p>
                    </div>
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><ClipboardListIcon className="h-6 w-6" /></div>
                </div>
                <div className="mt-4 flex items-center text-xs text-green-600 font-medium">
                    <TrendingUpIcon className="h-3 w-3 mr-1" />
                    <span>12% vs last period</span>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm text-gray-500">Total Units</p>
                        <p className="text-3xl font-bold text-gray-800 mt-2">{kpis.totalUnits.toLocaleString()}</p>
                    </div>
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><TruckIcon className="h-6 w-6" /></div>
                </div>
                <div className="mt-4 flex items-center text-xs text-green-600 font-medium">
                    <TrendingUpIcon className="h-3 w-3 mr-1" />
                    <span>8% vs last period</span>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm text-gray-500">Total Revenue</p>
                        <p className="text-3xl font-bold text-gray-800 mt-2">₹{(kpis.totalRevenue / 1000).toFixed(1)}k</p>
                    </div>
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg"><CurrencyIcon className="h-6 w-6" /></div>
                </div>
                <div className="mt-4 flex items-center text-xs text-green-600 font-medium">
                    <TrendingUpIcon className="h-3 w-3 mr-1" />
                    <span>15% vs last period</span>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm text-gray-500">Avg Fill Rate</p>
                        <p className="text-3xl font-bold text-gray-800 mt-2">{kpis.fillRate}%</p>
                    </div>
                    <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg"><PieChartIcon className="h-6 w-6" /></div>
                </div>
                <div className="mt-4 flex items-center text-xs text-red-500 font-medium">
                    <TrendingDownIcon className="h-3 w-3 mr-1" />
                    <span>2% vs last period</span>
                </div>
            </div>
        </div>
    );
};

export default ReportsKPIs;
