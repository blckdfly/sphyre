'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { HamburgerMenuIcon } from './Icons';

const Header: React.FC = () => {
    const router = useRouter();
    
    const handleSettingsClick = () => {
        router.push('/Settings');
    };
    
    return (
        <div className="bg-black px-6 pt-8 pb-6 flex items-center justify-between">
            <div className="flex items-center space-x-3">
                {/* Hamburger Menu */}
                <button 
                    className="p-2 -ml-2 text-light-50 hover:bg-gray-900 rounded-full transition-colors"
                    onClick={handleSettingsClick}
                >
                    <HamburgerMenuIcon className="w-6 h-6" />
                </button>
                
                {/* Logo Sphyre */}
                <div>
                    <Image src="/assets/sphyre-text.png" alt="Sphyre" width={120} height={32} className="h-8 w-auto" />
                </div>
            </div>
        </div>
    );
};

export default Header;