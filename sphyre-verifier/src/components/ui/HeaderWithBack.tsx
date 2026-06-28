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
        <div className="bg-light-50 border-b border-dark-100">
            <div className="flex items-center px-4 py-4">
                <button 
                    className="mr-4 p-2 -ml-2 hover:bg-light-200 rounded-full transition-colors"
                    onClick={onBackClick}
                >
                    <BackArrowIcon className="w-5 h-5 text-dark-500" />
                </button>
                <h1 className="text-xl font-semibold text-dark-500">{title}</h1>
            </div>
        </div>
    );
};

export default HeaderWithBack;