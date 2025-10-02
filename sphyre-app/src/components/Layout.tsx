'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import Image from 'next/image';
import BottomNav from './ui/BottomNav';

interface LayoutProps {
    username: string;
    onAddClick: () => void;
    onScanClick: () => void;
    onActivityClick: () => void;
    activeTab?: 'identity' | 'scan' | 'activity';
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({
                                           username,
                                           onAddClick,
                                           onScanClick,
                                           onActivityClick,
                                           activeTab = 'identity',
                                           children
                                       }) => {
    return (
        <div className="relative h-screen flex flex-col bg-black text-white">
            {/* Header */}
            <div className="bg-blue-600 p-4 flex items-center justify-between rounded-b-3xl z-10">
                <div className="flex items-center">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-300 mr-3">
                        <Image
                            src="@/public/assets/profile.JPG"
                            alt="Profile"
                            width={40}
                            height={40}
                            className="object-cover"
                        />
                    </div>
                    <span className="font-medium">@{username}</span>
                </div>
                <button className="text-white mr-2">
                    <Bell size={24} />
                </button>
            </div>

            {/* Main content */}
            <div className="flex-grow overflow-auto bg-white text-black pb-24">
                {children}
            </div>

            {/* Bottom Nav */}
            <div className="absolute bottom-0 left-0 right-0 z-20">
                <BottomNav
                    onAddClick={onAddClick}
                    onScanClick={onScanClick}
                    onActivityClick={onActivityClick}
                    activeTab={activeTab}
                />
            </div>
        </div>
    );
};

export default Layout;