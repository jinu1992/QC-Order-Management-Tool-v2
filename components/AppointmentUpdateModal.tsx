import React, { useState, FC } from 'react';
import { GroupedSalesOrder } from '../types';
import { 
    CalendarIcon, 
    XCircleIcon, 
    RefreshIcon, 
    CheckCircleIcon, 
    QuestionMarkCircleIcon 
} from './icons/Icons';
import { updateInstamartAppointmentDetails } from '../services/api';

interface AppointmentUpdateModalProps {
    so: GroupedSalesOrder;
    onClose: () => void;
    addNotification: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    onComplete: () => void;
}

// --- Formatters ---
const formatDateForInput = (dateStr?: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    // Handle DD-MM-YYYY
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateStr;
};

const formatTimeForInput = (timeInput?: any): string => {
    if (!timeInput) return '';
    const timeStr = String(timeInput).trim();

    // If it's an ISO string or similar, convert to local time
    if (timeStr.includes('T') || timeStr.includes('GMT') || (timeStr.length > 12 && timeStr.includes('-'))) {
        const dateObj = new Date(timeStr);
        if (!isNaN(dateObj.getTime())) {
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        }
    }

    // Handle HH:MM AM/PM
    const ampmMatch = timeStr.match(/(\d{1,2}):(\d{1,2})\s*(AM|PM)/i);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        const minutes = ampmMatch[2].padStart(2, '0');
        const ampm = ampmMatch[3].toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
    // Handle HH:MM:SS or HH:MM
    const parts = timeStr.match(/(\d{1,2}):(\d{1,2})/);
    if (parts) {
        return `${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
    }
    return timeStr;
};

const AppointmentUpdateModal: FC<AppointmentUpdateModalProps> = ({ so, onClose, addNotification, onComplete }) => {
    const [appointmentId, setAppointmentId] = useState(so.appointmentId || '');
    const [appointmentDate, setAppointmentDate] = useState(formatDateForInput(so.appointmentDate));
    const [appointmentTime, setAppointmentTime] = useState(formatTimeForInput(so.appointmentTime));
    const [isSubmitting, setIsSubmitting] = useState(false);

    const channelLower = so.channel.toLowerCase();
    const isZepto = channelLower.includes('zepto');
    const isInstamart = channelLower.includes('instamart');
    const isBB = channelLower.includes('bb');
    const isRBL = channelLower.includes('rbl');
    const isBlinkit = channelLower.includes('blinkit');
    
    // Most quick commerce channels don't need a manually entered ID as they use portal logic
    const hideIdField = isZepto || isInstamart || isBB || isRBL || isBlinkit;

    const getBrandDetails = () => {
        if (isZepto) return {
            color: 'bg-purple-600',
            text: 'text-purple-600',
            bg: 'bg-purple-50',
            border: 'border-purple-100',
            hover: 'hover:bg-purple-100',
            shadow: 'shadow-purple-100',
            ring: 'focus:ring-purple-500',
            label: 'Zepto'
        };
        if (isBB) return {
            color: 'bg-partners-green',
            text: 'text-partners-green',
            bg: 'bg-partners-light-green',
            border: 'border-green-100',
            hover: 'hover:bg-green-100',
            shadow: 'shadow-green-100',
            ring: 'focus:ring-partners-green',
            label: 'Big Basket'
        };
        if (isBlinkit) return {
            color: 'bg-yellow-500',
            text: 'text-yellow-700',
            bg: 'bg-yellow-50',
            border: 'border-yellow-100',
            hover: 'hover:bg-yellow-100',
            shadow: 'shadow-yellow-100',
            ring: 'focus:ring-yellow-500',
            label: 'Blinkit'
        };
        return {
            color: 'bg-orange-600',
            text: 'text-orange-600',
            bg: 'bg-orange-50',
            border: 'border-orange-100',
            hover: 'hover:bg-orange-100',
            shadow: 'shadow-orange-100',
            ring: 'focus:ring-orange-500',
            label: isInstamart ? 'Instamart' : 'Appointment'
        };
    };

    const brand = getBrandDetails();

    const handleComplete = async () => {
        const hasId = !hideIdField && appointmentId.trim();
        const hasDate = appointmentDate.trim();
        const hasTime = appointmentTime.trim();

        if (!hasId && !hasDate && !hasTime) {
            const msg = hideIdField
                ? "Please enter at least an Appointment Date or Time"
                : "Please enter at least an Appointment ID, Date or Time";
            addNotification(msg, "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await updateInstamartAppointmentDetails({
                eeReferenceCode: so.id,
                appointmentId: appointmentId.trim(),
                appointmentDate: appointmentDate.trim(),
                appointmentTime: appointmentTime.trim()
            });

            if (response.status === 'success') {
                addNotification("Appointment Details Updated!", "success");
                onComplete();
                onClose();
            } else {
                addNotification(response.message || "Failed to update appointment details", "error");
            }
        } catch (error) {
            addNotification("Error updating appointment details", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
            <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border ${brand.border} flex flex-col animate-in fade-in zoom-in-95 duration-200`}>
                <div className={`p-6 ${brand.bg} border-b ${brand.border} flex justify-between items-center`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${brand.color} rounded-xl flex items-center justify-center text-white shadow-lg ${brand.shadow}`}>
                            <CalendarIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800">{brand.label} Appointment</h3>
                            <p className={`text-xs ${brand.text} font-medium`}>Update confirmation details</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 ${brand.hover} rounded-full transition-colors`}><XCircleIcon className="h-6 w-6 text-gray-400" /></button>
                </div>

                <div className="p-8 space-y-6">
                    <div className="space-y-4">
                        {!hideIdField && (
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Appointment / Consignment ID</label>
                                <input
                                    type="text"
                                    value={appointmentId}
                                    onChange={(e) => setAppointmentId(e.target.value)}
                                    placeholder="Enter ID from confirmation"
                                    className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 ${brand.ring} focus:border-transparent transition-all`}
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Appointment Date</label>
                                <input
                                    type="date"
                                    value={appointmentDate}
                                    onChange={(e) => setAppointmentDate(e.target.value)}
                                    className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 ${brand.ring} focus:border-transparent transition-all`}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Appointment Time</label>
                                <input
                                    type="time"
                                    value={appointmentTime}
                                    onChange={(e) => setAppointmentTime(e.target.value)}
                                    className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 ${brand.ring} focus:border-transparent transition-all`}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={`${brand.bg} border ${brand.border} p-4 rounded-2xl flex gap-3`}>
                        <div className={`${isZepto ? 'bg-purple-200' : isBB ? 'bg-green-200' : isBlinkit ? 'bg-yellow-200' : 'bg-orange-200'} p-1.5 rounded-lg h-fit`}>
                            <QuestionMarkCircleIcon className={`h-4 w-4 ${isZepto ? 'text-purple-700' : isBB ? 'text-green-700' : isBlinkit ? 'text-yellow-700' : 'text-orange-700'}`} />
                        </div>
                        <p className={`text-[11px] ${isZepto ? 'text-purple-800' : isBB ? 'text-green-800' : isBlinkit ? 'text-yellow-800' : 'text-orange-800'} font-medium leading-relaxed`}>
                            Once updated, the order will be ready for <span className="font-bold text-blue-800">Shipping Partner</span> handover or final processing.
                        </p>
                    </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                    <button
                        onClick={handleComplete}
                        disabled={isSubmitting}
                        className={`flex-[2] px-4 py-3 ${brand.color} text-white text-sm font-bold rounded-xl shadow-lg ${brand.shadow} hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2`}
                    >
                        {isSubmitting ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                        {isSubmitting ? 'Updating...' : 'Update Appointment details'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AppointmentUpdateModal;
