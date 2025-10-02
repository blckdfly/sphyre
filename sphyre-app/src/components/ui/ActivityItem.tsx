import React from 'react';
import { Check, Clock } from 'lucide-react';

interface ActivityItemProps {
    title: string;
    date: string;
    status: 'success' | 'pending' | 'failed';
    onClick: () => void;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ title, date, status, onClick }) => {
    const getStatusIcon = () => {
        switch (status) {
            case 'success':
                return <Check size={16} className="text-green-500" />;
            case 'pending':
                return <Clock size={16} className="text-yellow-500" />;
            case 'failed':
                return <span className="text-red-500">×</span>;
            default:
                return null;
        }
    };

    return (
        <div
            className="border-b border-gray-200 py-3 flex justify-between items-center cursor-pointer"
            onClick={onClick}
        >
            <div>
                <h3 className="text-black font-medium">{title}</h3>
                <p className="text-gray-500 text-xs">{date}</p>
            </div>
            <div>
                {getStatusIcon()}
            </div>
        </div>
    );
};

export default ActivityItem;