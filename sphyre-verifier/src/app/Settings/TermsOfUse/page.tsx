'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import HeaderWithBack from '@/components/ui/HeaderWithBack';

const TermsOfUsePage: React.FC = () => {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-black">
            {/* Header */}
            <HeaderWithBack 
                title="Terms of Use" 
                onBackClick={() => router.back()}
            />

            {/* Content */}
            <div className="flex-grow bg-white px-4 pt-6 pb-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Terms of Use</h2>
                    
                    <div className="space-y-6">
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">1. Acceptance of Terms</h3>
                            <p className="text-gray-700 text-sm">
                                By using Sphyre Verifier, you agree to these Terms of Use. If you do not agree, please do not use the application.
                            </p>
                        </div>
                        
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">2. Use of the Service</h3>
                            <p className="text-gray-700 text-sm mb-4">
                                Sphyre Verifier is designed for credential verification. You agree to use the service only for its intended purpose and in compliance with all applicable laws and regulations.
                            </p>
                            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                                <li>Do not use the service for any illegal activities</li>
                                <li>Do not attempt to reverse engineer the application</li>
                                <li>Do not interfere with the operation of the service</li>
                            </ul>
                        </div>
                        
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">3. Privacy and Data</h3>
                            <p className="text-gray-700 text-sm">
                                Your use of Sphyre Verifier is also governed by our Privacy Policy. By using the service, you consent to the collection and use of information as detailed in the Privacy Policy.
                            </p>
                        </div>
                        
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">4. Modifications to Service</h3>
                            <p className="text-gray-700 text-sm">
                                We reserve the right to modify or discontinue the service at any time, with or without notice. We will not be liable to you or any third party for any modification, suspension, or discontinuance of the service.
                            </p>
                        </div>
                        
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">5. Limitation of Liability</h3>
                            <p className="text-gray-700 text-sm">
                                To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the service.
                            </p>
                        </div>
                    </div>
                    
                    <div className="mt-8">
                        <button 
                            className="w-full bg-blue-600 text-white rounded-xl p-4 font-medium hover:bg-blue-700 transition-colors"
                            onClick={() => router.back()}
                        >
                            I Accept
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TermsOfUsePage;