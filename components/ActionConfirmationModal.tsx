import React, { FC, useState, useEffect } from 'react';
import { 
    XCircleIcon, 
    AlertIcon, 
    CheckCircleIcon,
    ShieldCheckIcon,
    InfoIcon
} from './icons/Icons';

interface ActionConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    warning?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmColor?: string;
    iconType?: 'warning' | 'info' | 'danger' | 'success';
    verificationSteps?: string[];
}

const ActionConfirmationModal: FC<ActionConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    warning,
    confirmLabel = 'Confirm Action',
    cancelLabel = 'Cancel',
    confirmColor = 'bg-partners-green',
    iconType = 'warning',
    verificationSteps = []
}) => {
    const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
    
    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setCheckedSteps({});
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const allStepsVerified = verificationSteps.length === 0 || 
        verificationSteps.every((_, idx) => checkedSteps[idx]);

    const handleToggleStep = (idx: number) => {
        setCheckedSteps(prev => ({
            ...prev,
            [idx]: !prev[idx]
        }));
    };

    const getIcon = () => {
        switch (iconType) {
            case 'danger': return <AlertIcon className="h-6 w-6 text-red-600" />;
            case 'success': return <CheckCircleIcon className="h-6 w-6 text-green-600" />;
            case 'info': return <InfoIcon className="h-6 w-6 text-blue-600" />;
            default: return <ShieldCheckIcon className="h-6 w-6 text-amber-600" />;
        }
    };

    const getIconBg = () => {
        switch (iconType) {
            case 'danger': return 'bg-red-50';
            case 'success': return 'bg-green-50';
            case 'info': return 'bg-blue-50';
            default: return 'bg-amber-50';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${getIconBg()} rounded-xl flex items-center justify-center shadow-sm`}>
                            {getIcon()}
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <XCircleIcon className="h-6 w-6 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    <div>
                        <p className="text-sm text-gray-600 leading-relaxed font-medium">
                            {message}
                        </p>
                        {warning && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex gap-2">
                                <AlertIcon className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] font-bold text-red-700 leading-tight">
                                    {warning}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Verification Steps */}
                    {verificationSteps.length > 0 && (
                        <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Process Compliance Checklist</p>
                            {verificationSteps.map((step, idx) => (
                                <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                                    <div className="relative flex items-center h-5">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-partners-green focus:ring-partners-green"
                                            checked={!!checkedSteps[idx]}
                                            onChange={() => handleToggleStep(idx)}
                                        />
                                    </div>
                                    <span className={`text-xs font-bold leading-tight transition-colors ${checkedSteps[idx] ? 'text-gray-800' : 'text-gray-400 group-hover:text-gray-600'}`}>
                                        {step}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col gap-3">
                    <button
                        onClick={onConfirm}
                        disabled={!allStepsVerified}
                        className={`w-full py-3.5 ${confirmColor} text-white font-bold rounded-2xl shadow-lg hover:brightness-95 transition-all active:scale-95 text-sm disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed`}
                    >
                        {confirmLabel}
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-3 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ActionConfirmationModal;
