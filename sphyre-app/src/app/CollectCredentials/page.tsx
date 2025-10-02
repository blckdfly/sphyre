'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, CheckCircle } from 'lucide-react';

export default function CollectCredentialsPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleBack = () => {
        router.push('/SSIWalletIdentity');
    };

    const handleProceed = () => {
        console.log('Proceed clicked - collecting credential');
        // Add credential collection logic here
        alert('Credential collected successfully!');
        router.push('/SSIWalletIdentity');
    };

    const handleDecline = () => {
        console.log('Decline clicked');
        const confirmDecline = window.confirm('Are you sure you want to decline this credential offer?');
        if (confirmDecline) {
            router.push('/SSIWalletIdentity');
        }
    };

    const toggleExpanded = () => {
        setIsExpanded(!isExpanded);
    };

    const credentialAttributes = [
        'Employee ID',
        'Full Name',
        'Department',
        'Position',
        'Email Address',
        'Phone Number',
        'Start Date',
        'Manager',
        'Office Location',
        'Security Clearance Level',
        'Access Permissions',
        'Employee Type',
        'Salary Grade',
        'Benefits Package',
        'Emergency Contact',
        'Work Schedule',
        'Reporting Structure',
        'Company Vehicle',
        'Parking Permit',
        'Health Insurance Status'
    ];

    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-screen bg-white">
                <p className="text-black">Loading...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center border-b border-gray-200">
                <button
                    onClick={handleBack}
                    className="mr-4 p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <ArrowLeft size={24} className="text-gray-700" />
                </button>
                <h1 className="text-xl font-semibold text-gray-900">Collect credentials</h1>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 py-6">
                {/* Description */}
                <div className="mb-6">
                    <p className="text-gray-700 text-base leading-relaxed">
                        You have received an offer to collect your credential
                    </p>
                </div>

                {/* Credential Source */}
                <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Credential Source</h3>

                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                                    <span className="text-white font-bold text-sm">LICHA</span>
                                </div>
                                <div>
                                    <h4 className="font-medium text-gray-900">Licha IDV</h4>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <CheckCircle size={20} className="text-green-500" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Credential Details */}
                <div className="mb-8">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                        <button
                            onClick={toggleExpanded}
                            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-xl"
                        >
                            <div className="text-left">
                                <h4 className="font-medium text-gray-900">Lumera Employee Badge</h4>
                                <p className="text-sm text-gray-500 mt-1">20 Attributes</p>
                            </div>
                            <ChevronDown
                                size={20}
                                className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {isExpanded && (
                            <div className="px-4 pb-4 border-t border-gray-100 mt-2 pt-4">
                                <div className="space-y-2">
                                    {credentialAttributes.map((attribute, index) => (
                                        <div key={index} className="flex items-center space-x-2">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                            <span className="text-sm text-gray-700">{attribute}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Instructions */}
                <div className="mb-8">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        If you would like to accept this offer, click proceed and your credential will be securely collected from the source
                    </p>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="px-4 pb-6 space-y-3">
                <button
                    onClick={handleProceed}
                    className="w-full bg-blue-600 text-white py-4 rounded-full font-medium text-lg hover:bg-blue-700 transition-colors"
                >
                    Proceed
                </button>

                <button
                    onClick={handleDecline}
                    className="w-full text-red-600 py-2 font-medium text-lg hover:bg-red-50 rounded-full transition-colors"
                >
                    Decline
                </button>
            </div>
        </div>
    );
}