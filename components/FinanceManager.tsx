


import React, { useState, useMemo, FC, useRef, useEffect } from 'react';
import { PurchaseOrder, PaymentStatus, Customer } from '../types';
import { initialCustomers } from '../data/mockData';
import { CurrencyIcon, MailIcon, ReplyIcon, CheckCircleIcon, DotsVerticalIcon, FilterIcon, SearchIcon, XCircleIcon, UsersIcon, PlusIcon, BuildingIcon, DownloadIcon, SortIcon, ChevronDownIcon } from './icons/Icons';

interface FinanceManagerProps {
    purchaseOrders: PurchaseOrder[];
    setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
    addLog: (action: string, details: string) => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

// --- Helper Components ---

const PaymentStatusBadge: FC<{ status?: PaymentStatus }> = ({ status }) => {
    let color = 'bg-gray-100 text-gray-700';
    if (status === 'Received') color = 'bg-green-100 text-green-800';
    else if (status === 'Overdue') color = 'bg-red-100 text-red-800';
    else if (status === 'Partial') color = 'bg-yellow-100 text-yellow-800';
    else if (status === 'Pending') color = 'bg-blue-100 text-blue-800';

    return (
        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${color}`}>
            {status || 'Pending'}
        </span>
    );
};

const inputClassName = "mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 shadow-sm focus:border-partners-green focus:ring-partners-green sm:text-sm py-3 px-3";

interface RecordPaymentModalProps {
    po: PurchaseOrder;
    onClose: () => void;
    onSave: (amount: number) => void;
}

const RecordPaymentModal: FC<RecordPaymentModalProps> = ({ po, onClose, onSave }) => {
    const [amount, setAmount] = useState<string>('');
    const pendingAmount = po.amount - (po.amountReceived || 0);

    const handleSave = () => {
        const numAmount = parseFloat(amount);
        if (!isNaN(numAmount) && numAmount > 0) {
            onSave(numAmount);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Record Payment</h3>
                    <p className="text-sm text-gray-500 mt-1">PO: <span className="font-bold text-partners-green">{po.poNumber}</span></p>
                </div>
                <div className="p-6">
                    <div className="mb-4">
                        <p className="text-sm text-gray-600">Total Amount: <span className="font-semibold">₹{po.amount.toLocaleString('en-IN')}</span></p>
                        <p className="text-sm text-gray-600">Pending: <span className="font-semibold text-red-600">₹{pendingAmount.toLocaleString('en-IN')}</span></p>
                    </div>
                    <label className="block text-sm font-medium text-gray-700">Amount Received</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">₹</span>
                        </div>
                        <input
                            type="number"
                            className="focus:ring-partners-green focus:border-partners-green block w-full pl-7 pr-12 sm:text-sm border border-gray-300 rounded-lg py-3"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-partners-green border border-transparent rounded-md hover:bg-green-700">Save</button>
                </div>
            </div>
        </div>
    );
};

interface EmailReminderModalProps {
    po: PurchaseOrder;
    onClose: () => void;
    onSend: () => void;
}

const EmailReminderModal: FC<EmailReminderModalProps> = ({ po, onClose, onSend }) => {
    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Send Payment Reminder</h3>
                    <p className="text-sm text-gray-500 mt-1">To Finance Team @ <span className="font-bold text-partners-green">{po.channel}</span></p>
                </div>
                <div className="p-6 bg-gray-50 text-sm">
                    <p className="font-semibold">Subject: <span className="font-normal">Payment Due Reminder for PO: {po.poNumber}</span></p>
                    <div className="mt-4 p-4 border rounded-md bg-white text-gray-700 space-y-2">
                        <p>Dear Finance Team,</p>
                        <p>This is a gentle reminder that the payment for PO <strong>{po.poNumber}</strong> (Invoice Value: ₹{po.amount.toLocaleString('en-IN')}) is due on <strong>{po.paymentDueDate}</strong>.</p>
                        <p>Current Status: <strong className="uppercase">{po.paymentStatus}</strong></p>
                        <p>Please ensure the payment is processed at the earliest.</p>
                        <p className="mt-4">Best Regards,<br/>Accounts Team</p>
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-100 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button onClick={() => { onSend(); onClose(); }} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 flex items-center gap-2">
                        <MailIcon className="h-4 w-4" /> Send Email
                    </button>
                </div>
            </div>
        </div>
    );
}

interface CreateCustomerModalProps {
    onClose: () => void;
    onSave: (customer: Customer) => void;
}

const CreateCustomerModal: FC<CreateCustomerModalProps> = ({ onClose, onSave }) => {
    const [formData, setFormData] = useState<Partial<Customer>>({
        customerCode: '', contactId: '', contactName: '', companyName: '', email: '', phone: '', gstNo: '',
        shippingAddressId: '', shippingAttention: '', shippingAddress: '', shippingStreet2: '',
        shippingCity: '', shippingStateCode: '', shippingState: '', shippingZip: '', shippingPhone: '',
        stateCode: '', stnCode: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = () => {
        const newCustomer = { ...formData, id: Date.now().toString() } as Customer;
        onSave(newCustomer);
    };

    const labelClass = "block text-xs font-medium text-gray-700 mb-1";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl my-8">
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800">Create New Customer</h3>
                    <button onClick={onClose}><XCircleIcon className="h-6 w-6 text-gray-400 hover:text-gray-600"/></button>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-partners-green border-b pb-1 mb-2">Basic Details</h4>
                        <div><label className={labelClass}>Customer Code (ZOHO)</label><input name="customerCode" value={formData.customerCode} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>Company Name</label><input name="companyName" value={formData.companyName} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>Contact Name</label><input name="contactName" value={formData.contactName} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>Contact ID</label><input name="contactId" value={formData.contactId} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>Email</label><input name="email" type="email" value={formData.email} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>Phone</label><input name="phone" value={formData.phone} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>GST No</label><input name="gstNo" value={formData.gstNo} onChange={handleChange} className={inputClassName} /></div>
                    </div>

                    {/* Shipping Address 1 */}
                    <div className="space-y-4">
                         <h4 className="font-semibold text-partners-green border-b pb-1 mb-2">Shipping Details</h4>
                         <div><label className={labelClass}>Address ID</label><input name="shippingAddressId" value={formData.shippingAddressId} onChange={handleChange} className={inputClassName} /></div>
                         <div><label className={labelClass}>Attention</label><input name="shippingAttention" value={formData.shippingAttention} onChange={handleChange} className={inputClassName} /></div>
                         <div><label className={labelClass}>Address Line 1</label><input name="shippingAddress" value={formData.shippingAddress} onChange={handleChange} className={inputClassName} /></div>
                         <div><label className={labelClass}>Street 2</label><input name="shippingStreet2" value={formData.shippingStreet2} onChange={handleChange} className={inputClassName} /></div>
                         <div><label className={labelClass}>City</label><input name="shippingCity" value={formData.shippingCity} onChange={handleChange} className={inputClassName} /></div>
                    </div>

                     {/* Shipping Address 2 & Codes */}
                     <div className="space-y-4">
                        <h4 className="font-semibold text-partners-green border-b pb-1 mb-2">Location & Codes</h4>
                        <div><label className={labelClass}>State</label><input name="shippingState" value={formData.shippingState} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>Shipping State Code</label><input name="shippingStateCode" value={formData.shippingStateCode} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>Zip Code</label><input name="shippingZip" value={formData.shippingZip} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>Shipping Phone</label><input name="shippingPhone" value={formData.shippingPhone} onChange={handleChange} className={inputClassName} /></div>
                        <div className="pt-4 border-t"></div>
                        <div><label className={labelClass}>State Code (General)</label><input name="stateCode" value={formData.stateCode} onChange={handleChange} className={inputClassName} /></div>
                        <div><label className={labelClass}>STN Code (Events)</label><input name="stnCode" value={formData.stnCode} onChange={handleChange} className={inputClassName} /></div>
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-partners-green border border-transparent rounded-md hover:bg-green-700 flex items-center gap-2">
                        <CheckCircleIcon className="h-4 w-4" /> Create Customer
                    </button>
                </div>
            </div>
        </div>
    );
};

interface DownloadReportModalProps {
    onClose: () => void;
    data: PurchaseOrder[];
}

const DownloadReportModal: FC<DownloadReportModalProps> = ({ onClose, data }) => {
    const [reportType, setReportType] = useState<'current' | 'dateRange' | 'monthly' | 'quarterly' | 'yearly'>('current');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const handleDownload = () => {
        let dataToExport = [...data];

        if (reportType === 'dateRange' && startDate && endDate) {
            const start = new Date(startDate).getTime();
            const end = new Date(endDate).getTime();
            dataToExport = data.filter(item => {
                const d = new Date(item.billDate || item.orderDate).getTime();
                return d >= start && d <= end;
            });
        } else if (reportType === 'monthly') {
             const now = new Date();
             dataToExport = data.filter(item => {
                 const d = new Date(item.billDate || item.orderDate);
                 return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
             });
        } else if (reportType === 'quarterly') {
             // Simple logic: Last 3 months
             const now = new Date();
             const threeMonthsAgo = new Date();
             threeMonthsAgo.setMonth(now.getMonth() - 3);
             dataToExport = data.filter(item => {
                 const d = new Date(item.billDate || item.orderDate);
                 return d >= threeMonthsAgo && d <= now;
             });
        } else if (reportType === 'yearly') {
             const now = new Date();
             dataToExport = data.filter(item => {
                 const d = new Date(item.billDate || item.orderDate);
                 return d.getFullYear() === now.getFullYear();
             });
        }

        if (dataToExport.length === 0) {
            alert('No data found for the selected range.');
            return;
        }

        // Convert to CSV
        const headers = ['PO Number', 'Channel', 'Store Code', 'Bill Date', 'Due Date', 'Status', 'Amount', 'Received', 'Pending'];
        const rows = dataToExport.map(po => [
            po.poNumber,
            po.channel,
            po.storeCode,
            po.billDate || '-',
            po.paymentDueDate || '-',
            po.paymentStatus || 'Pending',
            po.amount,
            po.amountReceived || 0,
            po.amount - (po.amountReceived || 0)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `finance_report_${reportType}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
             <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">Download Finance Report</h3>
                    <p className="text-sm text-gray-500 mt-1">Select criteria for export</p>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="reportType" checked={reportType === 'current'} onChange={() => setReportType('current')} className="text-partners-green focus:ring-partners-green" />
                            <span>Current View (Filtered)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="reportType" checked={reportType === 'dateRange'} onChange={() => setReportType('dateRange')} className="text-partners-green focus:ring-partners-green" />
                            <span>Custom Date Range</span>
                        </label>
                        {reportType === 'dateRange' && (
                            <div className="ml-6 flex gap-2">
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm border rounded p-1" />
                                <span className="text-gray-500">-</span>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm border rounded p-1" />
                            </div>
                        )}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="reportType" checked={reportType === 'monthly'} onChange={() => setReportType('monthly')} className="text-partners-green focus:ring-partners-green" />
                            <span>Current Month</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="reportType" checked={reportType === 'quarterly'} onChange={() => setReportType('quarterly')} className="text-partners-green focus:ring-partners-green" />
                            <span>Current Quarter (Last 3 Months)</span>
                        </label>
                         <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="reportType" checked={reportType === 'yearly'} onChange={() => setReportType('yearly')} className="text-partners-green focus:ring-partners-green" />
                            <span>Current Year (YTD)</span>
                        </label>
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button onClick={handleDownload} className="px-4 py-2 text-sm font-medium text-white bg-partners-green border border-transparent rounded-md hover:bg-green-700 flex items-center gap-2">
                        <DownloadIcon className="h-4 w-4" /> Download CSV
                    </button>
                </div>
             </div>
        </div>
    )
}

// --- Main Component ---

const FinanceManager: React.FC<FinanceManagerProps> = ({ purchaseOrders, setPurchaseOrders, addLog, addNotification }) => {
    const [view, setView] = useState<'payments' | 'customers'>('payments');
    
    // Payment States
    const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean, po: PurchaseOrder | null }>({ isOpen: false, po: null });
    const [emailModal, setEmailModal] = useState<{ isOpen: boolean, po: PurchaseOrder | null }>({ isOpen: false, po: null });
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [showSummary, setShowSummary] = useState(true);
    const [showDownloadModal, setShowDownloadModal] = useState(false);

    // Customer States
    const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
    const [createCustomerModal, setCreateCustomerModal] = useState(false);

    // Filtering State
    const [columnFilters, setColumnFilters] = useState<{ [key: string]: string }>({});
    const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: keyof PurchaseOrder | 'storeChannel' | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

    const filterMenuRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const uniqueChannels = useMemo(() => Array.from(new Set(purchaseOrders.map(p => p.channel))), [purchaseOrders]);
    const paymentStatuses: PaymentStatus[] = ['Pending', 'Partial', 'Received', 'Overdue'];

    // PO Processing (Filter + Sort)
    const processedOrders = useMemo(() => {
        let orders = [...purchaseOrders];
        
        // 1. Filter
        Object.keys(columnFilters).forEach((key) => {
            const filterValue = columnFilters[key].toLowerCase();
            if (filterValue && view === 'payments') {
                orders = orders.filter(po => {
                    const itemValue = String((po as any)[key] || '').toLowerCase();
                    return itemValue.includes(filterValue);
                });
            }
        });

        // 2. Sort
        if (sortConfig.key && view === 'payments') {
            orders.sort((a, b) => {
                let valA: any = '';
                let valB: any = '';

                if (sortConfig.key === 'storeChannel') {
                    valA = `${a.channel} ${a.storeCode}`.toLowerCase();
                    valB = `${b.channel} ${b.storeCode}`.toLowerCase();
                } else {
                    valA = a[sortConfig.key as keyof PurchaseOrder] || '';
                    valB = b[sortConfig.key as keyof PurchaseOrder] || '';
                }

                // Date comparison
                if (['billDate', 'paymentDueDate'].includes(sortConfig.key as string)) {
                    valA = new Date(valA).getTime();
                    valB = new Date(valB).getTime();
                }
                
                // Numeric comparison
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                }

                // String comparison
                return sortConfig.direction === 'asc' 
                    ? String(valA).localeCompare(String(valB))
                    : String(valB).localeCompare(String(valA));
            });
        }

        return orders;
    }, [purchaseOrders, columnFilters, view, sortConfig]);

    // Summary Calculations
    const summaryStats = useMemo(() => {
        return processedOrders.reduce((acc, po) => ({
            total: acc.total + po.amount,
            received: acc.received + (po.amountReceived || 0),
            pending: acc.pending + (po.amount - (po.amountReceived || 0))
        }), { total: 0, received: 0, pending: 0 });
    }, [processedOrders]);

    // Customer Filter Logic
    const filteredCustomers = useMemo(() => {
        let custs = [...customers];
        Object.keys(columnFilters).forEach((key) => {
            const filterValue = columnFilters[key].toLowerCase();
            if (filterValue && view === 'customers') {
                custs = custs.filter(c => {
                    const itemValue = String((c as any)[key] || '').toLowerCase();
                    return itemValue.includes(filterValue);
                });
            }
        });
        return custs;
    }, [customers, columnFilters, view]);

    // Clear filters when switching views
    useEffect(() => {
        setColumnFilters({});
        setActiveFilterColumn(null);
        setSortConfig({ key: null, direction: 'asc' });
    }, [view]);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
            }
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setActiveFilterColumn(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRecordPayment = (amount: number) => {
        if (!paymentModal.po) return;
        setPurchaseOrders(prev => prev.map(p => {
            if (p.id === paymentModal.po!.id) {
                const newReceived = (p.amountReceived || 0) + amount;
                const newStatus: PaymentStatus = newReceived >= p.amount ? 'Received' : 'Partial';
                addLog('Payment Recorded', `Received ₹${amount} for PO ${p.poNumber}. Status: ${newStatus}`);
                addNotification(`Payment of ₹${amount} recorded for PO ${p.poNumber}.`, 'success');
                return { ...p, amountReceived: newReceived, paymentStatus: newStatus };
            }
            return p;
        }));
    };

    const handleSendReminder = (po: PurchaseOrder) => {
        setPurchaseOrders(prev => prev.map(p => 
            p.id === po.id ? { 
                ...p, 
                lastPaymentReminderDate: new Date().toLocaleString(), 
                paymentFollowUpCount: (p.paymentFollowUpCount || 0) + 1 
            } : p
        ));
        addLog('Payment Reminder', `Sent payment reminder for PO ${po.poNumber}`);
        addNotification(`Payment reminder sent for PO ${po.poNumber}.`, 'success');
    };

    const handleCreateCustomer = (customer: Customer) => {
        setCustomers(prev => [customer, ...prev]);
        addLog('Create Customer', `Created new customer: ${customer.companyName} (${customer.customerCode})`);
        addNotification(`Customer ${customer.companyName} created successfully.`, 'success');
        setCreateCustomerModal(false);
    };

    const calculatePending = (po: PurchaseOrder) => po.amount - (po.amountReceived || 0);

    const updateColumnFilter = (key: string, value: string) => {
        setColumnFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleSort = (key: keyof PurchaseOrder | 'storeChannel') => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const renderSortIcon = (key: string) => {
        if (sortConfig.key !== key) return <SortIcon className="inline-block ml-1 text-gray-300 h-3 w-3" />;
        return <SortIcon className={`inline-block ml-1 text-partners-green h-3 w-3 transform ${sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} />;
    };

    return (
        <>
            {paymentModal.isOpen && paymentModal.po && (
                <RecordPaymentModal 
                    po={paymentModal.po} 
                    onClose={() => setPaymentModal({ isOpen: false, po: null })} 
                    onSave={handleRecordPayment} 
                />
            )}
            {emailModal.isOpen && emailModal.po && (
                <EmailReminderModal 
                    po={emailModal.po}
                    onClose={() => setEmailModal({ isOpen: false, po: null })}
                    onSend={() => handleSendReminder(emailModal.po!)}
                />
            )}
            {createCustomerModal && (
                <CreateCustomerModal 
                    onClose={() => setCreateCustomerModal(false)}
                    onSave={handleCreateCustomer}
                />
            )}
            {showDownloadModal && (
                <DownloadReportModal 
                    data={view === 'payments' ? processedOrders : []} // Simple implementation passes processed orders or full list based on logic inside
                    onClose={() => setShowDownloadModal(false)}
                />
            )}

            <div className="p-4 sm:p-6 lg:p-8 flex-1">
                <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Finance & Payments</h1>
                        <p className="text-gray-500 mt-1">Track PO values, payments received, and manage customers.</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                         <div className="bg-white p-1 rounded-lg border border-gray-200 flex">
                            <button 
                                onClick={() => setView('payments')}
                                className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${view === 'payments' ? 'bg-partners-green text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                <CurrencyIcon className="h-4 w-4"/> Payments
                            </button>
                            <button 
                                onClick={() => setView('customers')}
                                className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${view === 'customers' ? 'bg-partners-green text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                <UsersIcon className="h-4 w-4"/> Customers
                            </button>
                        </div>

                        {view === 'payments' && (
                            <>
                                <button 
                                    onClick={() => setShowSummary(!showSummary)}
                                    className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${showSummary ? 'bg-gray-100 text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    {showSummary ? 'Hide Summary' : 'Show Summary'}
                                </button>
                                <button 
                                    onClick={() => setShowDownloadModal(true)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    <DownloadIcon className="h-4 w-4" /> Report
                                </button>
                            </>
                        )}

                        {view === 'customers' && (
                            <button 
                                onClick={() => setCreateCustomerModal(true)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                <PlusIcon className="h-4 w-4" /> Create Customer
                            </button>
                        )}
                        {Object.keys(columnFilters).length > 0 && (
                            <button 
                                onClick={() => setColumnFilters({})}
                                className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center gap-1 bg-red-50 px-3 py-2.5 rounded-lg transition-colors"
                            >
                                <XCircleIcon className="h-4 w-4"/> Clear Filters
                            </button>
                        )}
                    </div>
                </header>

                {/* Summary Bar */}
                {view === 'payments' && showSummary && (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
                            <p className="text-sm text-gray-500">Total PO Value</p>
                            <p className="text-2xl font-bold text-gray-800">₹{summaryStats.total.toLocaleString('en-IN')}</p>
                         </div>
                         <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-500">
                            <p className="text-sm text-gray-500">Total Received</p>
                            <p className="text-2xl font-bold text-green-700">₹{summaryStats.received.toLocaleString('en-IN')}</p>
                         </div>
                         <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-red-500">
                            <p className="text-sm text-gray-500">Total Pending</p>
                            <p className="text-2xl font-bold text-red-700">₹{summaryStats.pending.toLocaleString('en-IN')}</p>
                         </div>
                    </div>
                )}

                <div className="mt-6 bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        {view === 'payments' ? (
                             <table className="w-full text-sm text-left text-gray-600">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        {/* PO Number Filter */}
                                        <th scope="col" className="px-6 py-3 whitespace-nowrap relative group">
                                            <div className="flex items-center">
                                                PO Number 
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(activeFilterColumn === 'poNumber' ? null : 'poNumber'); }}
                                                    className={`ml-1 p-1 rounded hover:bg-gray-100 ${columnFilters['poNumber'] ? 'text-partners-green' : 'text-gray-400'}`}
                                                >
                                                    <SearchIcon className="h-4 w-4"/>
                                                </button>
                                            </div>
                                            {activeFilterColumn === 'poNumber' && (
                                                <div ref={filterMenuRef} className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-30 p-3">
                                                    <input
                                                        type="text"
                                                        placeholder="Search PO..."
                                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-partners-green/50 focus:border-partners-green"
                                                        value={columnFilters['poNumber'] || ''}
                                                        onChange={(e) => updateColumnFilter('poNumber', e.target.value)}
                                                        autoFocus
                                                    />
                                                </div>
                                            )}
                                        </th>

                                        {/* Store / Channel Filter & Sort */}
                                        <th scope="col" className="px-6 py-3 whitespace-nowrap relative group">
                                            <div className="flex items-center cursor-pointer" onClick={() => handleSort('storeChannel')}>
                                                Store / Channel
                                                {renderSortIcon('storeChannel')}
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(activeFilterColumn === 'storeChannel' ? null : 'storeChannel'); }}
                                                    className={`ml-1 p-1 rounded hover:bg-gray-100 ${columnFilters['channel'] || columnFilters['storeCode'] ? 'text-partners-green' : 'text-gray-400'}`}
                                                >
                                                    <FilterIcon className="h-4 w-4"/>
                                                </button>
                                            </div>
                                            {activeFilterColumn === 'storeChannel' && (
                                                <div ref={filterMenuRef} className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 z-30 p-3 space-y-3 cursor-default" onClick={e => e.stopPropagation()}>
                                                    <div>
                                                        <label className="text-xs font-semibold text-gray-500 block mb-1">Channel</label>
                                                        <select
                                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-partners-green/50 focus:border-partners-green"
                                                            value={columnFilters['channel'] || ''}
                                                            onChange={(e) => updateColumnFilter('channel', e.target.value)}
                                                        >
                                                            <option value="">All Channels</option>
                                                            {uniqueChannels.map(ch => (
                                                                <option key={ch} value={ch}>{ch}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-semibold text-gray-500 block mb-1">Store Code</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Search Store Code..."
                                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-partners-green/50 focus:border-partners-green"
                                                            value={columnFilters['storeCode'] || ''}
                                                            onChange={(e) => updateColumnFilter('storeCode', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </th>

                                        <th className="px-6 py-3">Qty</th>
                                        <th className="px-6 py-3 text-right">Total Value</th>
                                        <th className="px-6 py-3 text-right">Received</th>
                                        <th className="px-6 py-3 text-right">Pending</th>
                                        
                                        <th className="px-6 py-3 cursor-pointer whitespace-nowrap" onClick={() => handleSort('billDate')}>
                                            Bill Date {renderSortIcon('billDate')}
                                        </th>
                                        
                                        <th className="px-6 py-3 cursor-pointer whitespace-nowrap" onClick={() => handleSort('paymentDueDate')}>
                                            Due Date {renderSortIcon('paymentDueDate')}
                                        </th>

                                        {/* Status Filter & Sort */}
                                        <th scope="col" className="px-6 py-3 whitespace-nowrap relative group cursor-pointer" onClick={() => handleSort('paymentStatus')}>
                                            <div className="flex items-center">
                                                Status 
                                                {renderSortIcon('paymentStatus')}
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(activeFilterColumn === 'paymentStatus' ? null : 'paymentStatus'); }}
                                                    className={`ml-1 p-1 rounded hover:bg-gray-100 ${columnFilters['paymentStatus'] ? 'text-partners-green' : 'text-gray-400'}`}
                                                >
                                                    <FilterIcon className="h-4 w-4"/>
                                                </button>
                                            </div>
                                            {activeFilterColumn === 'paymentStatus' && (
                                                <div ref={filterMenuRef} className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-30 p-3 cursor-default" onClick={e => e.stopPropagation()}>
                                                    <select
                                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-partners-green/50 focus:border-partners-green"
                                                        value={columnFilters['paymentStatus'] || ''}
                                                        onChange={(e) => updateColumnFilter('paymentStatus', e.target.value)}
                                                    >
                                                        <option value="">All Statuses</option>
                                                        {paymentStatuses.map(status => (
                                                            <option key={status} value={status}>{status}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </th>

                                        <th className="px-6 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {processedOrders.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                                                No orders found matching your filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        processedOrders.map(po => {
                                            const pending = calculatePending(po);
                                            return (
                                                <tr key={po.id} className="bg-white border-b hover:bg-gray-50">
                                                    <td className="px-6 py-4 font-medium text-partners-green whitespace-nowrap">{po.poNumber}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-gray-900">{po.channel}</span>
                                                            <span className="text-xs text-gray-500">{po.storeCode}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">{po.qty}</td>
                                                    <td className="px-6 py-4 text-right font-medium">₹{po.amount.toLocaleString('en-IN')}</td>
                                                    <td className="px-6 py-4 text-right text-green-600">₹{(po.amountReceived || 0).toLocaleString('en-IN')}</td>
                                                    <td className="px-6 py-4 text-right text-red-600 font-semibold">₹{pending.toLocaleString('en-IN')}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">{po.billDate || '-'}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap">{po.paymentDueDate || '-'}</td>
                                                    <td className="px-6 py-4"><PaymentStatusBadge status={po.paymentStatus} /></td>
                                                    <td className="px-6 py-4 relative">
                                                         <div className="flex items-center gap-2">
                                                            {po.paymentStatus !== 'Received' && (
                                                                <button 
                                                                    onClick={() => setPaymentModal({ isOpen: true, po })}
                                                                    className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded hover:bg-green-100 transition"
                                                                >
                                                                    Record Pay
                                                                </button>
                                                            )}
                                                            
                                                            <div className="relative">
                                                                <button onClick={() => setActiveMenu(activeMenu === po.id ? null : po.id)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                                                                    <DotsVerticalIcon />
                                                                </button>
                                                                {activeMenu === po.id && (
                                                                    <div ref={menuRef} className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-100">
                                                                        <div className="py-1">
                                                                            <button 
                                                                                onClick={() => { setEmailModal({ isOpen: true, po }); setActiveMenu(null); }}
                                                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                                                            >
                                                                                <MailIcon className="h-4 w-4"/> Send Reminder
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => { handleSendReminder(po); setActiveMenu(null); }}
                                                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                                                            >
                                                                                <ReplyIcon className="h-4 w-4"/> Log Follow-up
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                         </div>
                                                         {po.paymentFollowUpCount ? (
                                                             <div className="mt-1 text-[10px] text-gray-400 text-right">
                                                                 {po.paymentFollowUpCount} follow-ups
                                                             </div>
                                                         ) : null}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full text-sm text-left text-gray-600">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 relative group">
                                            <div className="flex items-center">
                                                Customer 
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(activeFilterColumn === 'companyName' ? null : 'companyName'); }}
                                                    className={`ml-1 p-1 rounded hover:bg-gray-100 ${columnFilters['companyName'] ? 'text-partners-green' : 'text-gray-400'}`}
                                                >
                                                    <SearchIcon className="h-4 w-4"/>
                                                </button>
                                            </div>
                                            {activeFilterColumn === 'companyName' && (
                                                <div ref={filterMenuRef} className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-30 p-3">
                                                     <input
                                                        type="text"
                                                        placeholder="Search Company..."
                                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-partners-green/50 focus:border-partners-green"
                                                        value={columnFilters['companyName'] || ''}
                                                        onChange={(e) => updateColumnFilter('companyName', e.target.value)}
                                                        autoFocus
                                                    />
                                                </div>
                                            )}
                                        </th>
                                        <th scope="col" className="px-6 py-3">Contact</th>
                                        <th scope="col" className="px-6 py-3">GST No</th>
                                        <th scope="col" className="px-6 py-3 relative group">
                                            <div className="flex items-center">
                                                City / State
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(activeFilterColumn === 'location' ? null : 'location'); }}
                                                    className={`ml-1 p-1 rounded hover:bg-gray-100 ${columnFilters['shippingCity'] ? 'text-partners-green' : 'text-gray-400'}`}
                                                >
                                                    <FilterIcon className="h-4 w-4"/>
                                                </button>
                                            </div>
                                             {activeFilterColumn === 'location' && (
                                                <div ref={filterMenuRef} className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-30 p-3">
                                                     <input
                                                        type="text"
                                                        placeholder="Search City..."
                                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-partners-green/50 focus:border-partners-green"
                                                        value={columnFilters['shippingCity'] || ''}
                                                        onChange={(e) => updateColumnFilter('shippingCity', e.target.value)}
                                                        autoFocus
                                                    />
                                                </div>
                                            )}
                                        </th>
                                        <th scope="col" className="px-6 py-3">Phone</th>
                                        <th scope="col" className="px-6 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCustomers.length === 0 ? (
                                         <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                                No customers found.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredCustomers.map(cust => (
                                            <tr key={cust.id} className="bg-white border-b hover:bg-gray-50">
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900">{cust.companyName}</div>
                                                    <div className="text-xs text-gray-500 font-mono">{cust.customerCode}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div>{cust.contactName}</div>
                                                    <div className="text-xs text-gray-500">{cust.email}</div>
                                                </td>
                                                <td className="px-6 py-4 font-mono text-xs">{cust.gstNo}</td>
                                                <td className="px-6 py-4">
                                                    <div>{cust.shippingCity}</div>
                                                    <div className="text-xs text-gray-500">{cust.shippingState}</div>
                                                </td>
                                                <td className="px-6 py-4 text-sm">{cust.phone}</td>
                                                <td className="px-6 py-4">
                                                    <button className="text-partners-green hover:underline text-sm">Edit</button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default FinanceManager;