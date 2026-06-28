'use client';

import React from 'react';
import { ChevronUpIcon } from './Icons';

interface UseCaseCardProps {
    icon: React.ReactNode;
    title: string;
    cardId: string;
    isExpanded?: boolean;
    isSelected?: boolean;
    onToggle: () => void;
    onSelect: () => void;
    children?: React.ReactNode;
}

const UseCaseCard: React.FC<UseCaseCardProps> = ({
    icon,
    title,
    cardId, // eslint-disable-line @typescript-eslint/no-unused-vars
    isExpanded = false,
    isSelected = false,
    onToggle,
    onSelect,
    children
}) => (
    <div className={`border-2 rounded-lg ${isSelected ? 'border-primary-500' : 'border-dark-100'} bg-light-50 mb-4`}>
        <div className="flex">
            <button
                className="flex-1 flex items-center justify-between p-4 hover:bg-light-200 transition-colors"
                onClick={onToggle}
            >
                <div className="flex items-center space-x-3">
                    {icon}
                    <span className="font-medium text-dark-500">{title}</span>
                </div>
                <ChevronUpIcon className={`w-5 h-5 text-dark-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            <button
                className={`w-6 h-6 rounded-full border-2 m-4 flex-shrink-0 ${
                    isSelected
                        ? 'border-primary-500 bg-primary-500'
                        : 'border-dark-200 bg-light-50 hover:border-dark-300'
                } transition-colors`}
                onClick={onSelect}
            >
                {isSelected && (
                    <svg className="w-3 h-3 text-white m-auto" viewBox="0 0 24 24" fill="currentColor">
                        <polyline points="20,6 9,17 4,12" stroke="currentColor" strokeWidth="2" fill="none"/>
                    </svg>
                )}
            </button>
        </div>

        {isExpanded && (
            <div className="px-4 pb-4 border-t border-gray-100">
                {children}
            </div>
        )}
    </div>
);

export default UseCaseCard;