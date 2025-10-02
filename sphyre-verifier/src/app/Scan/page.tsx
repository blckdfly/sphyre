'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import HeaderWithBack from '@/components/ui/HeaderWithBack';

const ScanPage: React.FC = () => {
    const router = useRouter();
    const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
    const [scanning, setScanning] = useState(true);

    // Mock function to simulate QR code scanning
    useEffect(() => {
        // In a real implementation, this would use a camera library
        // For now, we'll just simulate camera permission
        const checkPermission = async () => {
            try {
                // This is a mock - in a real app, you would use the browser's camera API
                // navigator.mediaDevices.getUserMedia({ video: true })
                setCameraPermission(true);
            } catch (error) {
                console.error('Camera permission denied:', error);
                setCameraPermission(false);
            }
        };

        checkPermission();

        // Cleanup function
        return () => {
            // In a real implementation, you would stop the camera stream here
        };
    }, []);

    // Mock function to handle a successful scan
    const handleSuccessfulScan = (data: string) => {
        setScanning(false);
        // Process the scanned data
        console.log('QR Code scanned:', data);
        // Navigate to a result page or show a success message
    };

    return (
        <div className="min-h-screen bg-black">
            {/* Header */}
            <HeaderWithBack 
                title="Scan QR Code" 
                onBackClick={() => router.back()}
            />

            {/* Content */}
            <div className="flex-grow bg-white px-4 pt-6 pb-6 flex flex-col items-center">
                <div className="mb-6 text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Scan QR Code</h2>
                    <p className="text-gray-500 text-sm mb-8">
                        Scan a QR code from the Sphyre App holder
                    </p>
                    
                    {/* Camera Viewfinder */}
                    <div className="relative w-full max-w-sm aspect-square bg-black overflow-hidden mb-8">
                        {cameraPermission === false && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white p-4 text-center">
                                <div>
                                    <p className="mb-2">Camera access is required to scan QR codes.</p>
                                    <button 
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                                        onClick={() => setCameraPermission(true)} // This is just for the mock
                                    >
                                        Enable Camera
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {cameraPermission === true && (
                            <>
                                {/* This would be replaced with an actual camera feed */}
                                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                                    <p className="text-white text-sm">Camera feed would appear here</p>
                                </div>
                                
                                {/* Scanning overlay */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-3/4 h-3/4 border-2 border-white rounded-lg relative">
                                        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-blue-500 rounded-tl-lg"></div>
                                        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-blue-500 rounded-tr-lg"></div>
                                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-blue-500 rounded-bl-lg"></div>
                                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-blue-500 rounded-br-lg"></div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-2">
                        Position the QR code within the frame
                    </p>
                    
                    <button 
                        className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                        onClick={() => router.back()}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScanPage;