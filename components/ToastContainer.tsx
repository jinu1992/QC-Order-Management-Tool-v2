
import React, { useEffect, useState } from 'react';
import { CheckCircleIcon, XCircleIcon, InfoIcon, XIcon } from './icons/Icons';
import { NotificationItem } from '../types';

interface ToastProps {
    notification: NotificationItem;
    onClose: (id: string) => void;
}

const ToastCard: React.FC<ToastProps> = ({ notification, onClose }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        const timer = setTimeout(() => setIsVisible(true), 10);
        
        // Auto close after 5 seconds
        const closeTimer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(() => onClose(notification.id), 300); // Wait for exit animation
        }, 5000);

        return () => {
            clearTimeout(timer);
            clearTimeout(closeTimer);
        };
    }, [notification, onClose]);

    const getIcon = () => {
        switch (notification.type) {
            case 'success': return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
            case 'error': return <XCircleIcon className="h-6 w-6 text-red-500" />;
            case 'warning': return <InfoIcon className="h-6 w-6 text-yellow-500" />;
            default: return <InfoIcon className="h-6 w-6 text-blue-500" />;
        }
    };

    const getBorderColor = () => {
        switch (notification.type) {
            case 'success': return 'border-green-500';
            case 'error': return 'border-red-500';
            case 'warning': return 'border-yellow-500';
            default: return 'border-blue-500';
        }
    };

    return (
        <div 
            className={`flex items-center w-80 p-4 mb-4 text-gray-800 bg-white rounded-xl shadow-2xl border-l-4 ${getBorderColor()} transform transition-all duration-300 ease-in-out ${
                isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
            }`}
        >
            <div className="flex-shrink-0">
                {getIcon()}
            </div>
            <div className="ml-3 text-sm font-semibold flex-1">
                {notification.message}
                <div className="text-[10px] font-normal text-gray-400 mt-0.5">Auto-closing in 5s</div>
            </div>
            <button 
                onClick={() => {
                    setIsVisible(false);
                    setTimeout(() => onClose(notification.id), 300);
                }}
                className="ml-auto -mx-1.5 -my-1.5 bg-white text-gray-400 hover:text-gray-900 rounded-lg p-1.5 inline-flex h-8 w-8 transition-colors"
            >
                <XIcon className="h-4 w-4" />
            </button>
        </div>
    );
};

interface ToastContainerProps {
    toasts: NotificationItem[];
    onRemove: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end pointer-events-none">
            <div className="pointer-events-auto">
                {toasts.map(toast => (
                    <ToastCard key={toast.id} notification={toast} onClose={onRemove} />
                ))}
            </div>
        </div>
    );
};

export default ToastContainer;
