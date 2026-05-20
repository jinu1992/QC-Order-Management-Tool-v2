import React, { useState, FC } from 'react';
import { 
    XCircleIcon, 
    RefreshIcon, 
    CheckCircleIcon, 
    QuestionMarkCircleIcon 
} from './icons/Icons';
import { updateZeptoASN, saveOrderNote } from '../services/api';
import { User, GroupedSalesOrder } from '../types';

interface ZeptoASNModalProps {
    so: GroupedSalesOrder;
    onClose: () => void;
    addNotification: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    onComplete: () => void;
    currentUser?: User | null;
}

const ZeptoASNModal: FC<ZeptoASNModalProps> = ({ so, onClose, addNotification, onComplete, currentUser }) => {
    const [asnNumber, setAsnNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleComplete = async () => {
        if (!asnNumber.trim()) {
            addNotification("Please enter an ASN Number", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await updateZeptoASN(so.id, asnNumber.trim());

            if (response.status === 'success') {
                try {
                    const note = `[System] ASN Number Updated: ${asnNumber.trim()}`;
                    await saveOrderNote(so.poReference, note, currentUser?.name || 'System');
                } catch (noteErr) {
                    console.error("Failed to save timeline note:", noteErr);
                }

                addNotification("ASN Number Updated Successfully!", "success");
                onComplete();
                onClose();
            } else {
                addNotification(response.message || "Failed to update ASN number", "error");
            }
        } catch (error) {
            addNotification("Error updating ASN number", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
            <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-purple-100 flex flex-col animate-in fade-in zoom-in-95 duration-200`}>
                <div className={`p-6 bg-purple-50 border-b border-purple-100 flex justify-between items-center`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-purple-100`}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">Zepto ASN</h3>
                            <p className={`text-xs text-purple-600 font-medium`}>Update ASN for appointment</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 hover:bg-purple-100 rounded-full transition-colors`}><XCircleIcon className="h-6 w-6 text-gray-400" /></button>
                </div>

                <div className="p-8 space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">ASN Number</label>
                            <input
                                type="text"
                                value={asnNumber}
                                onChange={(e) => setAsnNumber(e.target.value)}
                                placeholder="Enter ASN Number"
                                className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all`}
                            />
                        </div>
                    </div>

                    <div className={`bg-purple-50 border border-purple-100 p-4 rounded-2xl flex gap-3`}>
                        <div className={`bg-purple-200 p-1.5 rounded-lg h-fit`}>
                            <QuestionMarkCircleIcon className={`h-4 w-4 text-purple-700`} />
                        </div>
                        <p className={`text-[11px] text-purple-800 font-medium leading-relaxed`}>
                            Updating the ASN number is required before the order can be processed further.
                        </p>
                    </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                    <button
                        onClick={handleComplete}
                        disabled={isSubmitting}
                        className={`flex-[2] px-4 py-3 bg-purple-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-purple-100 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2`}
                    >
                        {isSubmitting ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                        {isSubmitting ? 'Updating...' : 'Update ASN Number'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ZeptoASNModal;
