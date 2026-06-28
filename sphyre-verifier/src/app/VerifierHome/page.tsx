'use client'

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/ui/Header';

const QRCodeIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 11V3h8v8H3zm2-2h4V5H5v4zm8-6h8v8h-8V3zm2 2v4h4V5h-4zM3 21v-8h8v8H3zm2-2h4v-4H5v4zm10-2h2v2h-2v-2zm0-2h2v2h-2v-2zm2 0h2v2h-2v-2zm0 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm4-4h2v2h-2v-2zm-2-2h2v2h-2v-2z"/>
    </svg>
);


const Home: React.FC = () => {
    const router = useRouter();

    useEffect(() => {
        const verifierDID = localStorage.getItem('verifierDID');
        if (!verifierDID) {
            router.replace('/onboarding');
        }
    }, [router]);

    const handleViewDetailClick = () => {
        router.push('/PresetConfiguration');
    };

    return (
        <div className="min-h-screen bg-black flex flex-col">
            <Header />

            {/* Main Content */}
            <div className="flex-1 bg-white rounded-t-3xl px-4 py-6">
                <div className="max-w-md mx-auto">
                    {/* Title Section */}
                    <div className="text-center mb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Verifier Portal</h2>
                        <p className="text-gray-500 text-sm">Verify credentials and manage requests</p>
                    </div>

                    {/* Main Actions */}
                    <div className="space-y-4 mb-6">
                        {/* Generate QR button */}
                        <button
                            className="w-full bg-gradient-to-r from-[#0005FF] to-[#1A1AFF] text-white rounded-2xl p-6 flex items-center justify-between shadow-lg shadow-black/20 hover:from-[#0014FF] hover:to-[#2626FF] transition-all transform hover:scale-[1.02]"
                            onClick={() => router.push('/RequestCredential')}
                        >
                            <div className="flex items-center space-x-4">
                                <div className="bg-white/15 rounded-xl p-3">
                                    <QRCodeIcon className="w-8 h-8 text-white" />
                                </div>
                                <div className="text-left">
                                    <span className="text-lg font-bold block">Generate QR Code</span>
                                    <span className="text-sm text-blue-100">Create presentation request</span>
                                </div>
                            </div>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>

                        {/* Scan Credential button */}
                        <button
                            className="w-full bg-gradient-to-r from-[#0005FF] to-[#1A1AFF] text-white rounded-2xl p-6 flex items-center justify-between shadow-lg shadow-black/20 hover:from-[#0014FF] hover:to-[#2626FF] transition-all transform hover:scale-[1.02]"
                            onClick={() => router.push('/Scan')}
                        >
                            <div className="flex items-center space-x-4">
                                <div className="bg-white/15 rounded-xl p-3">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h8m-4 0v8m-4 0h2M4 4h2m2-2v2m12 0V2" />
                                    </svg>
                                </div>
                                <div className="text-left">
                                    <span className="text-lg font-bold block">Scan Credential</span>
                                    <span className="text-sm text-blue-100">Verify holder credentials</span>
                                </div>
                            </div>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>

                        {/* Recent Activity button */}
                        <button
                            className="w-full bg-gradient-to-r from-[#0005FF] to-[#1A1AFF] text-white rounded-2xl p-6 shadow-lg shadow-black/20 hover:from-[#0014FF] hover:to-[#2626FF] transition-all transform hover:scale-[1.02]"
                            onClick={() => router.push('/VerifierActivity')}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    <div className="bg-white/15 rounded-xl p-3">
                                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div className="text-left">
                                        <span className="text-lg font-bold block">Recent Activity</span>
                                        <span className="text-sm text-purple-100">Review your latest verification timeline</span>
                                    </div>
                                </div>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>
                    </div>

                    {/* Preset Configuration Link */}
                    <div className="text-center mt-4">
                        <button
                            className="text-gray-700 text-sm hover:text-gray-900 transition-colors"
                            onClick={handleViewDetailClick}
                        >
                            Preset Configuration
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;