'use client';

import React from 'react';

// Hamburger Menu Icon Component
export const HamburgerMenuIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
);

// Back Arrow Icon Component
export const BackArrowIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="15,18 9,12 15,6" />
    </svg>
);

// Chevron Up Icon Component
export const ChevronUpIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="18,15 12,9 6,15" />
    </svg>
);

// Chevron Right Icon Component
export const ChevronRightIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9,18 15,12 9,6" />
    </svg>
);

// Driver License Icon Component
export const DriverLicenseIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
);

// Age 21+ Icon Component
export const Age21Icon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <div className={`${className} rounded-full bg-gray-800 text-white flex items-center justify-center text-xs font-bold`}>
        21+
    </div>
);

// Age 18+ Icon Component
export const Age18Icon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <div className={`${className} rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold`}>
        18+
    </div>
);