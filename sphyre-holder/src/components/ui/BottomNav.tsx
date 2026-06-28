'use client';

import React from 'react';
import Image from 'next/image';

interface BottomNavProps {
    onAddClick: () => void;
    onScanClick?: () => void;
    onScanToggle?: () => void;
    onActivityClick: () => void;
    activeTab?: 'identity' | 'scan' | 'activity';
}

const BottomNav: React.FC<BottomNavProps> = ({
    onAddClick,
    onScanClick,
    onScanToggle,
    onActivityClick,
    activeTab = 'identity',
}) => {
    return (
        <div className="relative z-10 w-full py-4 flex justify-between items-center px-10 sm:px-16 bg-white mb-2">
            <div
                onClick={onAddClick}
                className="flex flex-col items-center cursor-pointer pl-4"
            >
                <Image
                    src="/icons/credentials.svg"
                    alt="Credentials"
                    width={32}
                    height={32}
                    className={`${activeTab === 'identity' ? 'opacity-100' : 'opacity-40'}`}
                />
                <span
                    className={`text-xs mt-1 ${
                        activeTab === 'identity' ? 'text-black' : 'text-dark-200'
                    }`}
                >
                </span>
            </div>

            <div className="absolute left-1/2 transform -translate-x-1/2 -translate-y-5">
                <div
                    onClick={onScanToggle || onScanClick}
                    className="bg-primary-500 rounded-full w-16 h-16 flex items-center justify-center cursor-pointer shadow-[0_18px_40px_-12px_rgba(0,5,255,0.45)] border border-white/30"
                >
                    <Image
                        src="/icons/sphyre.svg"
                        alt="Sphyre"
                        width={36}
                        height={36}
                        className="drop-shadow-sm"
                    />
                </div>
            </div>

            {/* Activity */}
            <div className="flex flex-col items-center cursor-pointer pr-4"
                onClick={onActivityClick}
            >
                <Image
                    src="/icons/activity.svg"
                    alt="Activity"
                    width={32}
                    height={32}
                    className={`${activeTab === 'activity' ? 'opacity-100' : 'opacity-40'}`}
                />
                <span
                    className={`text-xs mt-1 ${
                        activeTab === 'activity' ? 'text-black' : 'text-dark-200'
                    }`}
                >
                </span>
            </div>
        </div>
    );
};

export default BottomNav;