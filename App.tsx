
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import SummaryCard from './components/SummaryCard';
import PoTable from './components/PoTable';
import SalesOrderTable from './components/SalesOrderTable';
import AppointmentManager from './components/AppointmentManager';
import AdminPanel from './components/AdminPanel';
import FinanceManager from './components/FinanceManager';
import InventoryManager from './components/InventoryManager';
import ReportsManager from './components/ReportsManager';
import QuotationsManager from './components/QuotationsManager';
import ShipmentManager from './components/ShipmentManager';
import DispatchManager from './components/DispatchManager';
import FileUploader from './components/FileUploader';
import KnowledgeBase from './components/KnowledgeBase';
import ToastContainer from './components/ToastContainer';
import Login from './components/Login';
import LoadingCube from './components/LoadingCube';
import { XIcon, QuestionMarkCircleIcon, RefreshIcon } from './components/icons/Icons';
import { initialRolePermissions } from './data/mockData';
import { type PurchaseOrder, POStatus, ActivityLog, NotificationItem, ViewType, User, RolePermissions, InventoryItem, ChannelConfig, Quotation } from './types';
import { fetchPurchaseOrders, fetchInventoryFromSheet, fetchChannelConfigs, fetchUsers, fetchQuotations } from './services/api';

const App: React.FC = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<number>(0);

  // Authenticated state
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('qc_user');
    const now = Date.now();

    // Check session validity before restoring user
    const sessionStart = localStorage.getItem('qc_session_start');
    const lastAct = localStorage.getItem('qc_last_activity');
    const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
    const INACTIVITY_TIMEOUT = 9 * 60 * 60 * 1000;

    if (sessionStart && now - parseInt(sessionStart) > SESSION_TIMEOUT) return null;
    if (lastAct && now - parseInt(lastAct) > INACTIVITY_TIMEOUT) return null;

    return saved ? JSON.parse(saved) : null;
  });
  const [googleTokens, setGoogleTokens] = useState<any>(() => {
    const saved = localStorage.getItem('google_sheets_tokens');
    return saved ? JSON.parse(saved) : null;
  });

  // Session Management State
  const [sessionStartTime, setSessionStartTime] = useState<number>(() => {
    const saved = localStorage.getItem('qc_session_start');
    const now = Date.now();

    // Validate saved session start time against 24h limit
    if (saved) {
      const startTime = parseInt(saved);
      const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
      if (now - startTime < SESSION_TIMEOUT) {
        return startTime;
      }
    }

    localStorage.setItem('qc_session_start', now.toString());
    return now;
  });
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [isAuthChecked, setIsAuthChecked] = useState(true);

  const [users, setUsers] = useState<User[]>([]);
  const [rolePermissions] = useState<RolePermissions>(initialRolePermissions);

  const [activeView, setActiveView] = useState<ViewType>('Dashboard');
  const [activeFilter, setActiveFilter] = useState('New POs');
  const [activeInventoryTab, setActiveInventoryTab] = useState<'mapping' | 'shortfall'>('mapping');
  const [activeShipmentTab, setActiveShipmentTab] = useState<'All' | 'Today' | 'Tomorrow' | 'Missed' | 'RTO' | 'Delivered'>('All');
  const [activeDispatchTab, setActiveDispatchTab] = useState<'Pending' | 'Today' | 'Upcoming' | 'All'>('Pending');
  const [adminTab, setAdminTab] = useState<'users' | 'roles' | 'channels' | 'integrations' | 'logs'>('users');

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [channelConfigs, setChannelConfigs] = useState<ChannelConfig[]>([]);

  const [logs, setLogs] = useState<ActivityLog[]>([
    { id: '1', user: 'System', action: 'Init', details: 'System initialized.', timestamp: new Date().toLocaleString() }
  ]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);

  const addLog = useCallback((action: string, details: string) => {
    const newLog: ActivityLog = {
      id: Date.now().toString(),
      user: currentUser?.name || 'System',
      action,
      details,
      timestamp: new Date().toLocaleString()
    };
    setLogs(prev => [newLog, ...prev]);
  }, [currentUser]);

  const addNotification = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const newNotification: NotificationItem = {
      id: Date.now().toString(),
      message,
      timestamp: new Date().toLocaleTimeString(),
      read: false,
      type
    };
    setNotifications(prev => [newNotification, ...prev]);
    setToasts(prev => [...prev, newNotification]);
  }, []);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setGoogleTokens(null);
    localStorage.removeItem('qc_user');
    localStorage.removeItem('google_sheets_tokens');
    localStorage.removeItem('qc_session_start');
    localStorage.removeItem('qc_last_activity');
    setActiveView('Dashboard');
  }, []);

  // Session Expiry and Inactivity Logic
  useEffect(() => {
    if (!currentUser) return;

    const checkSession = () => {
      const now = Date.now();
      const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
      const INACTIVITY_TIMEOUT = 9 * 60 * 60 * 1000; // 9 hours

      // Check absolute session expiry
      if (now - sessionStartTime > SESSION_TIMEOUT) {
        addNotification("Session expired. Please login again.", "warning");
        handleLogout();
        return;
      }

      // Check inactivity
      const lastAct = parseInt(localStorage.getItem('qc_last_activity') || now.toString());
      if (now - lastAct > INACTIVITY_TIMEOUT) {
        addNotification("Logged out due to inactivity.", "info");
        handleLogout();
        return;
      }
    };

    const updateActivity = () => {
      const now = Date.now();
      setLastActivity(now);
      localStorage.setItem('qc_last_activity', now.toString());
    };

    // Listen for user activity
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    window.addEventListener('scroll', updateActivity);

    const intervalId = setInterval(checkSession, 60000); // Check every minute

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('scroll', updateActivity);
      clearInterval(intervalId);
    };
  }, [currentUser, sessionStartTime, handleLogout, addNotification]);

  const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('qc_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('qc_user');
    }
  }, [currentUser]);

  useEffect(() => {
    if (googleTokens) {
      localStorage.setItem('google_sheets_tokens', JSON.stringify(googleTokens));
    }
  }, [googleTokens]);

  const refreshData = useCallback(async (force = false) => {
    if (!currentUser) return;
    if (!force && purchaseOrders.length > 0 && Date.now() - lastSynced < 1800000) return;

    setIsLoading(true);
    try {
      const [poData, invData, channelData, userData, quotationData] = await Promise.all([
        fetchPurchaseOrders(),
        fetchInventoryFromSheet(),
        fetchChannelConfigs(),
        fetchUsers(),
        fetchQuotations()
      ]);

      if (poData.length > 0) setPurchaseOrders(poData);
      if (invData.length > 0) setInventoryItems(invData);
      if (channelData.length > 0) setChannelConfigs(channelData);
      if (userData.length > 0) setUsers(userData);
      if (quotationData.length > 0) setQuotations(quotationData);

      setLastSynced(Date.now());
    } catch (e) {
      addNotification('Failed to sync data.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [lastSynced, purchaseOrders.length, addNotification, currentUser]);

  useEffect(() => {
    if (currentUser) {
      refreshData();
      const intervalId = setInterval(() => refreshData(true), 5 * 60 * 1000);
      return () => clearInterval(intervalId);
    }
  }, [refreshData, currentUser]);

  useEffect(() => {
    if (activeView === 'Purchase Orders') {
      setActiveFilter('New POs');
    } else if (activeView === 'Sales Orders') {
      setActiveFilter('All POs');
    }
  }, [activeView]);

  const getCalculatedStatus = (po: PurchaseOrder): POStatus => {
    const items = po.items || [];
    const activeItems = items.filter(i => (i.itemStatus || '').toLowerCase() !== 'cancelled');
    const pushedItems = activeItems.filter(i => !!i.eeOrderRefId);
    const rawStatus = String(po.status || '').trim().toLowerCase();
    if (rawStatus === 'cancelled' || (items.length > 0 && activeItems.length === 0)) return POStatus.Cancelled;
    if (rawStatus === 'below threshold') return POStatus.BelowThreshold;
    if (activeItems.length > 0 && pushedItems.length === activeItems.length) return POStatus.Pushed;
    if (pushedItems.length > 0) return POStatus.PartiallyProcessed;
    if (rawStatus === 'confirmed' || rawStatus === 'confirmed to send') return POStatus.ConfirmedToSend;
    if (rawStatus === 'waiting for confirmation') return POStatus.WaitingForConfirmation;
    return POStatus.NewPO;
  };

  const summaryData = useMemo(() => {
    const totalActiveCount = purchaseOrders.filter(p => {
      const status = getCalculatedStatus(p);
      return status !== POStatus.Closed && status !== POStatus.Cancelled;
    }).length;
    const pushed = purchaseOrders.filter(p => getCalculatedStatus(p) === POStatus.Pushed).length;
    const partiallyPushed = purchaseOrders.filter(p => getCalculatedStatus(p) === POStatus.PartiallyProcessed).length;

    // Calculate total shortfall units for the new card
    let totalShortfall = 0;
    const newPOStatuses = [POStatus.NewPO, POStatus.WaitingForConfirmation, POStatus.ConfirmedToSend];
    purchaseOrders.forEach(po => {
      if (!newPOStatuses.includes(po.status)) return;
      (po.items || []).forEach(item => {
        if (!item.eeOrderRefId && (item.itemStatus || '').toLowerCase() !== 'cancelled') {
          totalShortfall += Math.max(0, (item.qty || 0) - (item.fulfillableQty || 0));
        }
      });
    });

    // Today's Pickups
    const todayStr = new Date().toDateString();
    const todayPickupsCount = purchaseOrders.filter(po => {
      const pDate = po.pickupDate || po.items?.find(i => i.pickupDate)?.pickupDate;
      if (!pDate) return false;
      try {
        return new Date(pDate).toDateString() === todayStr;
      } catch { return false; }
    }).length;

    // Pending Dispatches (Status is Shipped/Manifested but not Dispatched)
    const pendingDispatchesCount = purchaseOrders.filter(po => {
      const s = po.status || '';
      const isReady = ['Shipped', 'Label Generated', 'Batch Created', 'Manifested'].includes(s);
      return isReady && s !== POStatus.Dispatched;
    }).length;

    return [
      { title: 'Total Active POs', value: totalActiveCount.toString(), changeText: 'Across all stages', color: 'blue', targetView: 'Purchase Orders', targetFilter: 'All POs' },
      { title: 'Procurement Shortfall', value: totalShortfall.toString(), changeText: 'Units needed for New POs', color: 'red', targetView: 'Inventory', targetTab: 'shortfall' },
      { title: "Today's Pickups", value: todayPickupsCount.toString(), changeText: 'Scheduled for today', color: 'orange', targetView: 'Dispatch Manager', targetTab: 'Today' },
      { title: 'Pending Dispatches', value: pendingDispatchesCount.toString(), changeText: 'Awaiting warehouse action', color: 'indigo', targetView: 'Dispatch Manager', targetTab: 'Pending' },
      { title: 'Fully Pushed', value: pushed.toString(), changeText: 'To EasyEcom', color: 'green', targetView: 'Purchase Orders', targetFilter: 'Pushed POs' },
      { title: 'Partially Pushed', value: partiallyPushed.toString(), changeText: 'Pending items', color: 'yellow', targetView: 'Purchase Orders', targetFilter: 'Partially Pushed POs' },
    ];
  }, [purchaseOrders]);

  const tabCounts = useMemo(() => {
    const counts = { 'All POs': purchaseOrders.length, 'New POs': 0, 'Below Threshold POs': 0, 'Pushed POs': 0, 'Partially Pushed POs': 0, 'Cancelled POs': 0 };
    purchaseOrders.forEach(po => {
      const status = getCalculatedStatus(po);
      if (status === POStatus.NewPO || status === POStatus.ConfirmedToSend || status === POStatus.WaitingForConfirmation) counts['New POs']++;
      else if (status === POStatus.BelowThreshold) counts['Below Threshold POs']++;
      else if (status === POStatus.Pushed) counts['Pushed POs']++;
      else if (status === POStatus.PartiallyProcessed) counts['Partially Pushed POs']++;
      else if (status === POStatus.Cancelled) counts['Cancelled POs']++;
    });
    return counts;
  }, [purchaseOrders]);

  const handleCardClick = (view: ViewType, filter?: string, tab?: any) => {
    if (currentUser && rolePermissions[currentUser.role]?.includes(view)) {
      setActiveView(view);
      if (filter) setActiveFilter(filter);
      if (tab) {
        if (view === 'Inventory') setActiveInventoryTab(tab);
        if (view === 'Shipment Tracking') setActiveShipmentTab(tab);
        if (view === 'Dispatch Manager') setActiveDispatchTab(tab);
      }
    } else {
      addNotification(`Access Denied.`, 'error');
    }
  };

  const renderContent = () => {
    if (!currentUser) return null;
    if (isLoading && purchaseOrders.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <LoadingCube size="w-24 h-24" label="Solving your Dashboard..." />
        </div>
      );
    }

    switch (activeView) {
      case 'Dashboard':
        return (
          <div className="p-4 sm:p-6 lg:p-8 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {summaryData.map((card, index) => (
                <SummaryCard key={index} {...card as any} onClick={() => handleCardClick(card.targetView as ViewType, card.targetFilter, (card as any).targetTab)} />
              ))}
            </div>
          </div>
        );
      case 'Quotations':
        return <QuotationsManager quotations={quotations} onRefresh={() => refreshData(true)} addNotification={addNotification} />;
      case 'Purchase Orders':
        return (
          <div className="p-4 sm:p-6 lg:p-8 flex-1">
            <PoTable activeFilter={activeFilter} setActiveFilter={setActiveFilter} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} tabCounts={tabCounts} addLog={addLog} addNotification={addNotification} onSync={() => refreshData(true)} isSyncing={isLoading} channelConfigs={channelConfigs} currentUser={currentUser} />
          </div>
        );
      case 'File Uploader':
        return <FileUploader currentUser={currentUser} addLog={addLog} addNotification={addNotification} />;
      case 'Inventory': return <InventoryManager addLog={addLog} inventoryItems={inventoryItems} purchaseOrders={purchaseOrders} setInventoryItems={setInventoryItems} onSync={() => refreshData(true)} isSyncing={isLoading} activeTab={activeInventoryTab} setActiveTab={setActiveInventoryTab} addNotification={addNotification} />;
      case 'Finance': return <FinanceManager purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} addLog={addLog} addNotification={addNotification} />;
      case 'Shipment Tracking': return <ShipmentManager purchaseOrders={purchaseOrders} currentUser={currentUser} />;
      case 'Dispatch Manager': return <DispatchManager purchaseOrders={purchaseOrders} currentUser={currentUser} initialTab={activeDispatchTab} />;
      case 'Reports': return <ReportsManager purchaseOrders={purchaseOrders} inventoryItems={inventoryItems} />;
      case 'Appointments':
        return <AppointmentManager purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} addLog={addLog} addNotification={addNotification} />;
      case 'Sales Orders':
        return (
          <div className="p-4 sm:p-6 lg:p-8 flex-1">
            <SalesOrderTable
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              purchaseOrders={purchaseOrders}
              setPurchaseOrders={setPurchaseOrders}
              tabCounts={tabCounts}
              addLog={addLog}
              addNotification={addNotification}
              onSync={() => refreshData(true)}
              isSyncing={isLoading}
              inventoryItems={inventoryItems}
              googleTokens={googleTokens}
              setGoogleTokens={setGoogleTokens}
              currentUser={currentUser}
            />
          </div>
        );
      case 'Admin': return (
        <AdminPanel logs={logs} users={users} setUsers={setUsers} rolePermissions={rolePermissions} setRolePermissions={() => { }} addLog={addLog} currentUser={currentUser} channelConfigs={channelConfigs} onSync={() => refreshData(true)} activeTab={adminTab} setActiveTab={setAdminTab} addNotification={addNotification} />
      );
      case 'Knowledge Base': return <KnowledgeBase />;
      default: return <div className="p-8 text-center text-gray-500">Section Under Construction</div>;
    }
  };

  if (!isAuthChecked) return null;

  // Show login screen if no user
  if (!currentUser) {
    return <Login onLoginSuccess={(user, tokens) => {
      const now = Date.now();
      setSessionStartTime(now);
      localStorage.setItem('qc_session_start', now.toString());
      localStorage.setItem('qc_last_activity', now.toString());
      setCurrentUser(user);
      if (tokens) setGoogleTokens(tokens);
      addLog('Login', `User ${user.name} authenticated.`);
    }} />;
  }

  return (
    <div className="flex h-screen bg-partners-gray-bg font-sans overflow-hidden">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Sidebar Container */}
      <div
        className={`fixed lg:relative inset-y-0 left-0 z-30 transition-all duration-300 ease-in-out border-r border-partners-border bg-white ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full'
          }`}
      >
        <div className={`w-64 h-full ${!isSidebarOpen && 'invisible'}`}>
          <Sidebar activeView={activeView} setActiveView={setActiveView} currentUser={currentUser} permissions={rolePermissions} onLogout={handleLogout} />
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto transition-all duration-300 ease-in-out">
        <Header
          notifications={notifications}
          onMarkRead={() => { }}
          onClearAll={() => { }}
          onViewLogs={() => { setActiveView('Admin'); setAdminTab('logs'); }}
          activeView={activeView}
          onToggleSidebar={toggleSidebar}
          onLogout={handleLogout}
          lastSynced={lastSynced}
        />
        {renderContent()}
      </main>

      <button 
        onClick={() => setActiveView('Knowledge Base')}
        className="fixed bottom-6 right-6 bg-green-600 text-white p-3 rounded-full shadow-lg hover:bg-green-700 transition-all hover:scale-110 flex items-center gap-2 z-40"
      >
        <QuestionMarkCircleIcon className="h-6 w-6" />
        <span className="font-bold text-sm pr-1">Help</span>
      </button>
    </div>
  );
};

export default App;
