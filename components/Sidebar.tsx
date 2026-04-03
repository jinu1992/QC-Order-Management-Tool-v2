
import React, { useState } from 'react';
import { ViewType, User, RolePermissions } from '../types';
import { 
    SummaryIcon, 
    ReportIcon,
    AdminIcon,
    UploadIcon,
    TruckIcon,
    ExternalLinkIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ClipboardListIcon,
    CurrencyIcon,
    CubeIcon,
    XCircleIcon,
    CalendarIcon,
    CloudDownloadIcon as FileIcon,
    LogoutIcon
} from './icons/Icons';

interface SidebarProps {
    activeView: ViewType;
    setActiveFilter?: (filter: string) => void;
    setActiveView: (view: ViewType) => void;
    currentUser: User;
    permissions: RolePermissions;
    onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, currentUser, permissions, onLogout }) => {
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);

  const allMenuItems: { name: ViewType, icon: React.ReactElement }[] = [
    { name: 'Dashboard', icon: <SummaryIcon /> },
    { name: 'Quotations', icon: <ClipboardListIcon /> },
    { name: 'Purchase Orders', icon: <ClipboardListIcon /> },
    { name: 'Sales Orders', icon: <TruckIcon /> },
    { name: 'Appointments', icon: <CalendarIcon /> },
    { name: 'File Uploader', icon: <FileIcon className="h-5 w-5" /> },
    { name: 'Inventory', icon: <CubeIcon /> },
    { name: 'Shipment Tracking', icon: <TruckIcon /> },
    { name: 'Finance', icon: <CurrencyIcon /> },
    { name: 'Dispatch Manager', icon: <TruckIcon /> },
    { name: 'Reports', icon: <ReportIcon /> },
    { name: 'Admin', icon: <AdminIcon /> },
    { name: 'Knowledge Base', icon: <XCircleIcon /> }, // Using XCircleIcon as placeholder or QuestionMark if available
  ];
  
  const allowedViews = permissions[currentUser.role] || [];
  const menuItems = allMenuItems.filter(item => allowedViews.includes(item.name));

  return (
    <aside className="w-64 bg-white h-full flex flex-col border-r border-partners-border">
      <div className="p-6 border-b border-partners-border">
        <div className="flex items-center">
            <div className="w-10 h-10 bg-partners-green rounded-xl mr-3 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-green-50">C</div>
            <div>
                <h1 className="font-bold text-lg text-gray-800">Cubelelo</h1>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">B2B Quick Commerce Portal</p>
            </div>
        </div>
      </div>
      
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.name}>
              <a href="#" onClick={(e) => { e.preventDefault(); setActiveView(item.name); }}
                className={`flex items-center p-3 rounded-xl text-sm font-bold transition-all ${
                  activeView === item.name 
                    ? 'bg-partners-light-green text-partners-green shadow-sm' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <div className={`${activeView === item.name ? 'text-partners-green' : 'text-gray-400'}`}>
                    {item.icon}
                </div>
                <span className="ml-3">{item.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-partners-border bg-gray-50/50">
        <div className="flex flex-col gap-2">
            <div className="flex items-center p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-blue-50">
                    {currentUser.avatarInitials}
                </div>
                <div className="ml-3 overflow-hidden flex-1">
                    <p className="text-sm font-bold text-gray-800 truncate">{currentUser.name}</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">{currentUser.role}</p>
                </div>
            </div>

            <button 
                onClick={onLogout}
                className="flex items-center gap-3 p-3 w-full rounded-xl text-sm font-bold text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 transition-all active:scale-95 group shadow-sm"
            >
                <LogoutIcon className="h-5 w-5 text-red-500 group-hover:text-red-700 transition-colors" />
                <span>Logout Session</span>
            </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
