'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import HeaderWithBack from '@/components/ui/HeaderWithBack';

const PrivacyPolicyPage: React.FC = () => {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-black">
            {/* Header */}
            <HeaderWithBack 
                title="Privacy Policy" 
                onBackClick={() => router.back()}
            />

            {/* Content */}
            <div className="flex-grow bg-white px-4 pt-6 pb-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Privacy Policy</h2>
                    
                    <div className="space-y-6">
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">1. Information We Collect</h3>
                            <p className="text-gray-700 text-sm mb-4">
                                Sphyre Verifier is designed with privacy in mind. We collect minimal information necessary for the verification process. This includes:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                                <li>Verification session data</li>
                                <li>Credential verification results</li>
                                <li>Device information for security purposes</li>
                            </ul>
                        </div>
                        
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">2. How We Use Your Information</h3>
                            <p className="text-gray-700 text-sm mb-4">
                                The information collected is used solely for:
                            </p>
                            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                                <li>Facilitating the verification process</li>
                                <li>Ensuring security and preventing fraud</li>
                                <li>Improving our services</li>
                            </ul>
                        </div>
                        
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">3. Data Storage and Security</h3>
                            <p className="text-gray-700 text-sm">
                                All data is encrypted and stored securely. We implement industry-standard security measures to protect your information from unauthorized access or disclosure.
                            </p>
                        </div>
                        
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">4. Your Rights</h3>
                            <p className="text-gray-700 text-sm">
                                You have the right to access, correct, or delete your personal information. Contact our support team for assistance with exercising these rights.
                            </p>
                        </div>
                    </div>
                    
                    <div className="mt-8">
                        <button 
                            className="w-full bg-blue-600 text-white rounded-xl p-4 font-medium hover:bg-blue-700 transition-colors"
                            onClick={() => router.back()}
                        >
                            I Understand
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicyPage;