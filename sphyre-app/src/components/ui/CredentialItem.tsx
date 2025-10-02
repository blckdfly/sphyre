// src/components/ui/CredentialItem.tsx
'use client';

import React from 'react';
import { MoreHorizontal, Wifi } from 'lucide-react';

interface CredentialItemProps {
    id: number;
    title: string;
    domain: string;
    logo?: string;
    isOnline?: boolean;
    onOptionsClick: (id: number) => void;
    onClick?: (id: number) => void;
}

const CredentialItem: React.FC<CredentialItemProps> = ({
                                                           id,
                                                           title,
                                                           domain,
                                                           isOnline = true,
                                                           onOptionsClick,
                                                           onClick
                                                       }) => {
    const handleClick = () => {
        if (onClick) {
            onClick(id);
        }
    };

    const handleOptionsClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onOptionsClick(id);
    };

    return (
        <div
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
            onClick={handleClick}
        >
            <div className="flex items-center space-x-3">
                {/* Logo */}
                <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">LICHA</span>
                </div>

                {/* Credential Info */}
                <div className="flex-1 min-w-0">
                    <h3 className="text-gray-900 font-medium text-sm truncate">
                        {title}
                    </h3>
                    <p className="text-gray-500 text-xs mt-1 truncate">
                        {domain}
                    </p>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2 flex-shrink-0">
                {/* Connection Status */}
                <div className="flex items-center space-x-1">
                    <Wifi
                        size={16}
                        className={`${isOnline ? 'text-green-500' : 'text-gray-400'}`}
                    />
                </div>

                {/* Options Menu */}
                <button
                    onClick={handleOptionsClick}
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <MoreHorizontal size={16} className="text-gray-400" />
                </button>
            </div>
        </div>
    );
};

export default CredentialItem;