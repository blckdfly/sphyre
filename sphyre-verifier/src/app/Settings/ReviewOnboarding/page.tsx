'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import HeaderWithBack from '@/components/ui/HeaderWithBack';

const ReviewOnboardingPage: React.FC = () => {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-black">
            {/* Header */}
            <HeaderWithBack 
                title="Review Onboarding" 
                onBackClick={() => router.back()}
            />

            {/* Content */}
            <div className="flex-grow bg-white px-4 pt-6 pb-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Sphyre Verifier</h2>
                    
                    <div className="space-y-6">
                        <div className="bg-blue-50 p-4">
                            <h3 className="font-semibold text-blue-800 mb-2">Step 1: Setup Your Verifier</h3>
                            <p className="text-blue-700 text-sm">
                                Configure your verifier identity and set up the credentials you want to verify.
                            </p>
                        </div>
                        
                        <div className="bg-blue-50 p-4">
                            <h3 className="font-semibold text-blue-800 mb-2">Step 2: Present QR Code</h3>
                            <p className="text-blue-700 text-sm">
                                Use the Presentation feature to generate a QR code that can be scanned by the Sphyre App holder.
                            </p>
                        </div>
                        
                        <div className="bg-blue-50 p-4">
                            <h3 className="font-semibold text-blue-800 mb-2">Step 3: Scan Credentials</h3>
                            <p className="text-blue-700 text-sm">
                                Use the Scan feature to scan QR codes presented by Sphyre App holders to verify their credentials.
                            </p>
                        </div>
                        
                        <div className="bg-blue-50 p-4">
                            <h3 className="font-semibold text-blue-800 mb-2">Step 4: Manage Settings</h3>
                            <p className="text-blue-700 text-sm">
                                Customize your verification experience through the Settings menu.
                            </p>
                        </div>
                    </div>
                    
                    <div className="mt-8">
                        <button 
                            className="w-full bg-blue-600 text-white rounded-xl p-4 font-medium hover:bg-blue-700 transition-colors"
                            onClick={() => router.back()}
                        >
                            Got it
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReviewOnboardingPage;