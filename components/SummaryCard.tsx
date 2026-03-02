import React from 'react';
import { InfoIcon } from './icons/Icons';

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  changeText: string;
  color: 'green' | 'red' | 'yellow' | 'blue';
  onClick?: () => void;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, subtitle, changeText, color, onClick }) => {
  const bgColor = 
    color === 'green' ? 'bg-partners-light-green' : 
    color === 'red' ? 'bg-partners-light-red' : 
    color === 'yellow' ? 'bg-partners-light-yellow' :
    'bg-partners-light-blue';

  const textColor = 
    color === 'green' ? 'text-partners-green' : 
    color === 'red' ? 'text-partners-red' :
    color === 'yellow' ? 'text-yellow-600' :
    'text-partners-blue';
  
  return (
    <div 
      onClick={onClick}
      className={`p-5 rounded-xl shadow-sm ${bgColor} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow hover:opacity-90' : ''}`}
    >
      <p className="text-sm text-gray-600">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-4xl font-bold text-gray-900">{value}</p>
        {subtitle && <p className="text-gray-700 font-semibold">{subtitle}</p>}
      </div>
      <div className="mt-2 flex items-center gap-1 text-sm">
        <InfoIcon className={textColor} />
        <span className={textColor}>{changeText}</span>
      </div>
    </div>
  );
};

export default SummaryCard;