'use client'

import React from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/ui/Header';

// QR Code Icon Component
const QRCodeIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 11V3h8v8H3zm2-2h4V5H5v4zm8-6h8v8h-8V3zm2 2v4h4V5h-4zM3 21v-8h8v8H3zm2-2h4v-4H5v4zm10-2h2v2h-2v-2zm0-2h2v2h-2v-2zm2 0h2v2h-2v-2zm0 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm4-4h2v2h-2v-2zm-2-2h2v2h-2v-2z"/>
    </svg>
);

// Document Icon Component
const DocumentIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
    </svg>
);

// 21 Icon Component (stylized)
const TwentyOneIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 48 48" fill="currentColor">
        <text x="24" y="32" textAnchor="middle" fontSize="20" fontWeight="bold" fontFamily="serif">Content</text>
    </svg>
);

const Home: React.FC = () => {
    const router = useRouter();

    const handleViewDetailClick = () => {
        router.push('/PresetConfiguration');
    };

    return (
        <div className="h-screen bg-black overflow-hidden flex flex-col">
            <Header />

            {/* Main Content */}
            <div className="flex-grow bg-white rounded-t-3xl px-4 pt-6 pb-6 flex flex-col">
                {/* Component Cards Section */}
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Verifier Identity</h2>
                    <p className="text-gray-500 text-sm mb-4">Verify credentials and manage configurations</p>

                    {/* Component Cards - 3 layout grid */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-gray-100 rounded-lg p-3 flex items-center justify-center">
                            <TwentyOneIcon className="w-9 h-6 text-gray-600" />
                        </div>
                        <div className="bg-gray-100 rounded-lg p-3 flex items-center justify-center">
                            <TwentyOneIcon className="w-9 h-6 text-gray-600" />
                        </div>
                        <div className="bg-gray-100 rounded-lg p-3 flex items-center justify-center">
                            <TwentyOneIcon className="w-9 h-6 text-gray-600" />
                        </div>
                    </div>

                    {/* View Detail button */}
                    <div className="flex justify-end mb-6">
                        <button
                            className="px-3 py-1 text-blue-600 border border-blue-600 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors"
                            onClick={handleViewDetailClick}
                        >
                            View Detail
                        </button>
                    </div>
                </div>

                {/* Bottom buttons */}
                <div className="space-y-3 flex-shrink-0 mt-auto">
                    {/* Presentation button */}
                    <button
                        className="w-full bg-blue-600 text-white rounded-xl p-4 flex flex-col items-center justify-center space-y-2 hover:bg-blue-700 transition-colors"
                        onClick={() => router.push('/Presentation')}
                    >
                        <QRCodeIcon className="w-6 h-6 text-white" />
                        <span className="text-lg font-semibold">Presentation</span>
                    </button>

                    {/* Scan button */}
                    <button
                        className="w-full bg-blue-600 text-white rounded-xl p-4 flex flex-col items-center justify-center space-y-2 hover:bg-blue-700 transition-colors"
                        onClick={() => router.push('/Scan')}
                    >
                        <QRCodeIcon className="w-6 h-6 text-white" />
                        <span className="text-lg font-semibold">Scan</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Home;