'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import HeaderWithBack from '@/components/ui/HeaderWithBack';
import QRCode from 'react-qr-code';
import { verifierApi } from '@/app/api/fortroApi';

const PresentationPage: React.FC = () => {
    const router = useRouter();
    const [qrValue, setQrValue] = useState('');
    
    // Fetch QR code data from Fortro Engine
    useEffect(() => {
        const fetchQrData = async () => {
            try {
                // In a real implementation, you would get the token from your auth system
                const mockToken = 'mock-token-for-development';
                
                // Request data - this would be configured based on what credentials you want to verify
                const requestData = {
                    type: 'presentation_request',
                    credentialTypes: ['VerifierIdentity'],
                    callbackUrl: window.location.origin + '/api/callback',
                };
                
                // Call Fortro Engine API to create a presentation request
                const response = await verifierApi.createPresentationRequest(mockToken, requestData);
                
                // The response should contain the QR code data
                if (response && response.qrCodeData) {
                    setQrValue(response.qrCodeData);
                } else {
                    // Fallback to local generation if API fails
                    const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                    const qrData = JSON.stringify({
                        type: 'sphyre-verifier-presentation',
                        sessionId: sessionId,
                        timestamp: new Date().toISOString(),
                        verifierId: 'sphyre-verifier-001',
                        note: 'Fallback QR - Fortro Engine unavailable'
                    });
                    setQrValue(qrData);
                    console.warn('Using fallback QR code - Fortro Engine response did not contain QR data');
                }
            } catch (error) {
                console.error('Error fetching QR code from Fortro Engine:', error);
                
                // Fallback to local generation if API fails
                const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                const qrData = JSON.stringify({
                    type: 'sphyre-verifier-presentation',
                    sessionId: sessionId,
                    timestamp: new Date().toISOString(),
                    verifierId: 'sphyre-verifier-001',
                    note: 'Fallback QR - Fortro Engine error'
                });
                setQrValue(qrData);
                console.warn('Using fallback QR code due to API error');
            }
        };
        
        fetchQrData();
    }, []);

    return (
        <div className="min-h-screen bg-black">
            {/* Header */}
            <HeaderWithBack 
                title="Presentation" 
                onBackClick={() => router.back()}
            />

            {/* Content */}
            <div className="flex-grow bg-white px-4 pt-6 pb-6 flex flex-col items-center">
                <div className="mb-6 text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Scan QR Code</h2>
                    <p className="text-gray-500 text-sm mb-8">
                        Present this QR code to be scanned by the Sphyre App holder
                    </p>
                    
                    {/* QR Code Container */}
                    <div className="bg-white p-4 shadow-md inline-block mb-8">
                        {qrValue && (
                            <QRCode
                                value={qrValue}
                                size={250}
                                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                viewBox={`0 0 256 256`}
                            />
                        )}
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-2">
                        This QR code will expire in 5 minutes
                    </p>
                    
                    <button 
                        className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                        onClick={() => router.back()}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PresentationPage;