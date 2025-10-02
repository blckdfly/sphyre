import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ActionButtonProps {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    hasBorder?: boolean;
    className?: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({
                                                       icon: Icon,
                                                       label,
                                                       onClick,
                                                       hasBorder = false,
                                                       className = '',
                                                   }) => {
    return (
        <div
            className={`flex flex-col items-center justify-center cursor-pointer p-4 ${
                hasBorder ? 'border-r border-blue-400' : ''
            } ${className}`}
            onClick={onClick}
        >
            <div className="mb-2">
                <Icon size={24} />
            </div>
            <div className="text-xs text-center">
                {label}
            </div>
        </div>
    );
};

export default ActionButton;