
import React, { useState, useMemo } from 'react';
import { POStatus, type PurchaseOrder } from '../types';
import { CheckCircleIcon, XCircleIcon, ProfileIcon } from './icons/Icons';

interface PocVerificationProps {
    purchaseOrders: PurchaseOrder[];
    setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
    addLog: (action: string, details: string) => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const PocVerification: React.FC<PocVerificationProps> = ({ purchaseOrders, setPurchaseOrders, addLog, addNotification }) => {
    const [last4Digits, setLast4Digits] = useState<{ [key: string]: string }>({});
    const [verificationStatus, setVerificationStatus] = useState<{ [key: string]: 'success' | 'error' | null }>({});
    
    const ordersToVerify = useMemo(() => {
        return purchaseOrders.filter(po => po.status === POStatus.POCPending && po.pocPhoneNumber);
    }, [purchaseOrders]);

    const handleInputChange = (poId: string, value: string) => {
        if (/^\d{0,4}$/.test(value)) {
            setLast4Digits(prev => ({...prev, [poId]: value}));
        }
    };

    const handleVerify = (po: PurchaseOrder) => {
        const enteredDigits = last4Digits[po.id] || '';
        if (!po.pocPhoneNumber || enteredDigits.length !== 4) return;

        const actualLast4 = po.pocPhoneNumber.slice(-4);

        if (enteredDigits === actualLast4) {
            setVerificationStatus(prev => ({ ...prev, [po.id]: 'success' }));
            addLog('Verification', `POC Contact verified for PO ${po.poNumber}`);
            addNotification(`POC Contact verified for PO ${po.poNumber}`, 'success');
            setTimeout(() => {
                setPurchaseOrders(prev => prev.map(order => 
                    order.id === po.id ? { 
                        ...order, 
                        contactVerified: true, 
                        status: POStatus.AppointmentPending,
                        actionToBeTaken: 'Take Appointment' 
                    } : order
                ));
            }, 1000);
        } else {
            setVerificationStatus(prev => ({ ...prev, [po.id]: 'error' }));
            addLog('Verification Failed', `Failed POC verification attempt for PO ${po.poNumber}`);
            addNotification(`Invalid POC verification for PO ${po.poNumber}`, 'error');
             setTimeout(() => {
                setVerificationStatus(prev => ({ ...prev, [po.id]: null }));
            }, 2000);
        }
    };

    const getButtonState = (poId: string) => {
        const status = verificationStatus[poId];
        if (status === 'success') return 'bg-green-500 hover:bg-green-600';
        if (status === 'error') return 'bg-red-500 hover:bg-red-600';
        return 'bg-partners-green hover:bg-green-700 disabled:bg-gray-400';
    };

    const getButtonContent = (po: PurchaseOrder) => {
        const status = verificationStatus[po.id];
        if (status === 'success') return <CheckCircleIcon className="h-5 w-5" />;
        if (status === 'error') return <XCircleIcon className="h-5 w-5" />;
        return 'Verify';
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 flex-1">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                {ordersToVerify.length === 0 ? (
                    <div className="text-center py-12">
                        <ProfileIcon className="mx-auto h-16 w-16 text-gray-200"/>
                        <h3 className="mt-4 text-lg font-bold text-gray-800">All Clear!</h3>
                        <p className="mt-1 text-gray-400">There are no pending POC verifications at this time.</p>
                    </div>
                ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-600">
                        <thead className="text-[11px] text-gray-500 uppercase bg-gray-50/50">
                            <tr>
                                <th scope="col" className="px-6 py-4">PO Number</th>
                                <th scope="col" className="px-6 py-4">Store Code</th>
                                <th scope="col" className="px-6 py-4">Masked Phone Number</th>
                                <th scope="col" className="px-6 py-4">Enter Last 4 Digits</th>
                                <th scope="col" className="px-6 py-4">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {ordersToVerify.map(po => (
                                <tr key={po.id} className="bg-white hover:bg-gray-50/80 transition-colors">
                                    <td className="px-6 py-4 font-bold text-partners-green whitespace-nowrap">{po.poNumber}</td>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-600">{po.storeCode}</td>
                                    <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-400 tracking-wider">{`******${po.pocPhoneNumber?.slice(-4)}`}</td>
                                    <td className="px-6 py-4">
                                        <input 
                                            type="text"
                                            maxLength={4}
                                            value={last4Digits[po.id] || ''}
                                            onChange={(e) => handleInputChange(po.id, e.target.value)}
                                            className="w-24 p-2 border border-gray-300 rounded-lg focus:ring-partners-green focus:border-partners-green font-mono tracking-widest text-center shadow-inner"
                                            placeholder="XXXX"
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <button 
                                            onClick={() => handleVerify(po)}
                                            disabled={!last4Digits[po.id] || last4Digits[po.id]?.length !== 4 || !!verificationStatus[po.id]}
                                            className={`px-4 py-2 text-white font-bold rounded-lg transition-all text-xs w-24 flex justify-center items-center shadow-sm active:scale-95 ${getButtonState(po.id)}`}
                                        >
                                            {getButtonContent(po)}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                )}
            </div>
        </div>
    );
};

export default PocVerification;
