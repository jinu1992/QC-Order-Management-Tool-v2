
import React from 'react';
import { POStatus } from '../types';

interface StatusBadgeProps {
  status: POStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusStyles = () => {
    switch (status) {
      case POStatus.NewPO:
        return 'bg-blue-100 text-blue-800';
      case POStatus.WaitingForConfirmation:
        return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case POStatus.ConfirmedToSend:
        return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
      case POStatus.Cancelled:
        return 'bg-red-100 text-red-800';
      case POStatus.Pushed:
        return 'bg-green-600 text-white shadow-sm';
      case POStatus.PartiallyProcessed:
        return 'bg-amber-500 text-white shadow-sm';
      case POStatus.BelowThreshold:
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <span className={`px-3 py-1 text-[10px] font-bold rounded-full capitalize ${getStatusStyles()}`}>
      {status === POStatus.PartiallyProcessed ? 'Partially Pushed' : status}
    </span>
  );
};

export default StatusBadge;
