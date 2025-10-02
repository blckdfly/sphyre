'use client';

import React from 'react';
import { ChevronRightIcon } from './Icons';

interface SettingsItemProps {
    title: string;
    hasChevron?: boolean;
    rightContent?: string;
    onClick?: () => void;
}

const SettingsItem: React.FC<SettingsItemProps> = ({
    title,
    hasChevron = true,
    rightContent,
    onClick = () => console.log(`${title} clicked`)
}) => (
    <button
        className="w-full flex items-center justify-between py-4 px-0 bg-white hover:bg-gray-50 transition-colors text-left"
        onClick={onClick}
    >
        <span className="text-gray-900 font-medium">{title}</span>
        <div className="flex items-center space-x-2">
            {rightContent && (
                <span className="text-gray-500 text-sm">{rightContent}</span>
            )}
            {hasChevron && (
                <ChevronRightIcon className="w-5 h-5 text-gray-400" />
            )}
        </div>
    </button>
);

export default SettingsItem;