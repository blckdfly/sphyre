'use client';

import React from 'react';
import { BackArrowIcon } from './Icons';

interface HeaderWithBackProps {
    title: string;
    onBackClick?: () => void;
}

const HeaderWithBack: React.FC<HeaderWithBackProps> = ({ 
    title, 
    onBackClick = () => console.log('Back button clicked') 
}) => {
    return (
        <div className="bg-white border-b border-gray-200">
            <div className="flex items-center px-4 py-4">
                <button 
                    className="mr-4 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
                    onClick={onBackClick}
                >
                    <BackArrowIcon className="w-5 h-5 text-gray-700" />
                </button>
                <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            </div>
        </div>
    );
};

export default HeaderWithBack;