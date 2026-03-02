
import React, { useState, useRef, useEffect } from 'react';
import { DownloadIcon, BellIcon, CheckCircleIcon, InfoIcon, AdminIcon, MenuIcon, ArrowsExpandIcon, ArrowsMinimizeIcon } from './icons/Icons';
import { NotificationItem, ViewType } from '../types';

interface HeaderProps {
    notifications: NotificationItem[];
    onMarkRead: (id: string) => void;
    onClearAll: () => void;
    onViewLogs: () => void;
    activeView: ViewType;
    onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ notifications, onMarkRead, onClearAll, onViewLogs, activeView, onToggleSidebar }) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    // Robust check for fullscreen support
    const doc = document as any;
    const isSupported = !!(
      doc.fullscreenEnabled || 
      doc.webkitFullscreenEnabled || 
      doc.mozFullScreenEnabled || 
      doc.msFullscreenEnabled
    );
    // If we can't detect it, we assume true to allow the browser to try
    setCanFullscreen(isSupported !== false);

    const handleFullscreenChange = () => {
      const isCurrentlyFull = !!(
        doc.fullscreenElement || 
        doc.webkitFullscreenElement || 
        doc.mozFullScreenElement || 
        doc.msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFull);
    };

    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    events.forEach(event => document.addEventListener(event, handleFullscreenChange));

    return () => {
      events.forEach(event => document.removeEventListener(event, handleFullscreenChange));
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      const docEl = document.documentElement as any;
      const doc = document as any;
      
      const isCurrentlyFull = !!(
        doc.fullscreenElement || 
        doc.webkitFullscreenElement || 
        doc.mozFullScreenElement || 
        doc.msFullscreenElement
      );

      if (!isCurrentlyFull) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      }
    } catch (err) {
      console.error("Fullscreen toggle failed:", err);
      // This usually happens if the iframe doesn't have allow="fullscreen"
      alert("Fullscreen is restricted by the platform container. Try opening the app in a new tab.");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSubtext = () => {
    switch(activeView) {
        case 'Dashboard': return 'Real-time tracking of all purchase orders and shipment stages';
        case 'Purchase Orders': return 'Manage and process incoming purchase orders';
        case 'POC Verification': return 'Verify Point-of-Contact mobile numbers';
        case 'Appointments': return 'Schedule and track warehouse delivery slots';
        case 'Sales Orders': return 'Track fulfillment and shipping status of processed orders';
        case 'GRN / POD': return 'Manage Goods Received Notes and Proof of Delivery';
        case 'Inventory': return 'Mapping and stock management synced from EasyEcom';
        case 'Finance': return 'Track PO values, payments received, and customer accounts';
        case 'Reports': return 'Visual analytics and performance reporting';
        case 'Admin': return 'System configuration, role permissions, and activity logs';
        default: return 'Cubelelo Purchase Order Management Portal';
    }
  };

  return (
    <header className="flex flex-col md:flex-row justify-between md:items-center bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <button 
          onClick={onToggleSidebar}
          className="p-2 -ml-2 text-gray-600 hover:text-partners-green hover:bg-partners-light-green rounded-lg transition-colors"
          title="Toggle Navigation"
        >
          <MenuIcon className="h-6 w-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{activeView === 'Dashboard' ? 'PO Dashboard' : activeView}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{getSubtext()}</p>
        </div>
      </div>
      
      <div className="mt-4 md:mt-0 flex items-center gap-2 sm:gap-4">
        {canFullscreen && (
          <button 
              onClick={toggleFullscreen}
              className="p-2 text-gray-800 hover:text-partners-green hover:bg-gray-100 rounded-full transition-all border border-transparent hover:border-gray-200 active:scale-95"
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
              {isFullscreen ? <ArrowsMinimizeIcon className="h-6 w-6" /> : <ArrowsExpandIcon className="h-6 w-6" />}
          </button>
        )}

        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 text-gray-800 hover:text-partners-green hover:bg-gray-100 rounded-full relative focus:outline-none transition-all border border-transparent hover:border-gray-200 active:scale-95"
                aria-label="Toggle notifications"
            >
                <BellIcon className="h-6 w-6" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                        {unreadCount}
                    </span>
                )}
            </button>

            {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden ring-1 ring-black ring-opacity-5">
                    <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-sm text-gray-700">Notifications History</h3>
                        {notifications.length > 0 && (
                            <button onClick={onClearAll} className="text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-wider">
                                Clear all
                            </button>
                        )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
                                <BellIcon className="h-8 w-8 text-gray-200" />
                                <p>No notifications yet.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-50">
                                {notifications.map((notification) => (
                                    <li 
                                        key={notification.id} 
                                        className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer group ${!notification.read ? 'bg-blue-50/50' : ''}`}
                                        onClick={() => onMarkRead(notification.id)}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-1 p-2 rounded-full flex-shrink-0 ${
                                                notification.type === 'success' ? 'bg-green-100 text-green-600' : 
                                                notification.type === 'error' ? 'bg-red-100 text-red-600' :
                                                'bg-blue-100 text-blue-600'
                                            }`}>
                                                {notification.type === 'success' ? <CheckCircleIcon className="h-4 w-4"/> : <InfoIcon className="h-4 w-4"/>}
                                            </div>
                                            <div className="flex-1">
                                                <p className={`text-sm leading-tight ${!notification.read ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{notification.message}</p>
                                                <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                                                    <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                                                    {notification.timestamp}
                                                </p>
                                            </div>
                                            {!notification.read && (
                                                <span className="h-2 w-2 bg-blue-500 rounded-full mt-2 ring-4 ring-blue-50"></span>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
                        <button 
                            onClick={() => { setIsNotificationsOpen(false); onViewLogs(); }} 
                            className="text-[10px] font-bold text-partners-green hover:text-green-700 flex items-center justify-center w-full py-1.5 gap-2 uppercase tracking-widest transition-colors"
                        >
                            <AdminIcon className="h-4 w-4" />
                            Admin Activity Logs
                        </button>
                    </div>
                </div>
            )}
        </div>

        {(activeView === 'Purchase Orders' || activeView === 'Dashboard' || activeView === 'Sales Orders') && (
            <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-partners-green border border-partners-green rounded-lg hover:bg-partners-light-green transition-all active:scale-95 shadow-sm">
                <DownloadIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Bulk Export</span>
            </button>
        )}
      </div>
    </header>
  );
};

export default Header;
