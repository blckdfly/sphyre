'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { ConsentScopeItem, findActiveConsentByRequesterAndScope } from '@/lib/consent';
import { setCurrentRequest } from '@/lib/currentRequest';

export default function CredentialRequestPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [hasFullConsent, setHasFullConsent] = useState<boolean>(false);

    // Demo requested info and requester (in real flow, parsed from QR/deeplink)
    const requestedScope: ConsentScopeItem[] = useMemo(() => ([
        { id: 'age_over_21', label: 'Age verification (over 21)' },
        { id: 'org_affiliation', label: 'Organizational affiliation' },
    ]), []);
    const requesterId = 'aurora.verifier';
    const requesterName = 'Aurora Verifier';

    useEffect(() => {
        setMounted(true);
        // Save current request context for downstream pages
        setCurrentRequest({
            requesterId,
            requesterName,
            requestedScope,
            purposeHint: 'Service access verification',
        });
        // Check if existing consent fully covers the requested scope
        const scopeIds = requestedScope.map((s) => s.id);
        const consent = findActiveConsentByRequesterAndScope(requesterId, scopeIds);
        setHasFullConsent(!!consent);
    }, [requestedScope]);

    const handleStart = () => {
        router.push('/CredentialSelection');
    };

    const handleDecline = () => {
        const confirmDecline = window.confirm('Are you sure you want to decline this request?');
        if (confirmDecline) {
            console.log('Request declined');
            router.push('/SSIWalletIdentity');
        }
    };

    const handleClose = () => {
        router.push('/SSIWalletIdentity');
    };

    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-screen bg-white">
                <p className="text-black">Loading...</p>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center border-b border-gray-200">
                <button onClick={handleClose} className="mr-3">
                    <X size={24} className="text-gray-600" />
                </button>
                <h1 className="text-lg font-medium text-gray-900">Information Request</h1>
            </div>

            {/* Content */}
            <div className="flex-1 px-6 py-8 flex flex-col">
                <div className="flex-1">
                    <h2 className="text-2xl font-semibold text-gray-900 mb-6 leading-tight">
                        You have received a request to present credentials
                    </h2>

                    {hasFullConsent ? (
                        <div className="mb-6 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                            This request is already covered by your active consent. You can proceed and share data according to the existing consent.
                        </div>
                    ) : (
                        <div className="mb-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            Some of the information below may require additional consent before it can be shared.
                        </div>
                    )}

                    {/* Connection Visual */}
                    <div className="flex items-center justify-center mb-8">
                        <div className="relative">
                            {/* Connection Circle */}
                            <div className="w-48 h-48 border-2 border-gray-300 rounded-full flex items-center justify-center relative">
                                {/* Left Logo (Blue) */}
                                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                                        <div className="w-6 h-6 bg-blue-600 rounded-full relative overflow-hidden">
                                            <div className="absolute inset-0 bg-white opacity-20">
                                                <div className="w-full h-full bg-gradient-to-r from-transparent via-white to-transparent transform rotate-45"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Logo (AURORA) */}
                                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-teal-700 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">AURORA</span>
                                </div>

                                {/* Connection Line */}
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-0.5 bg-gray-400 flex items-center justify-center">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Request Info */}
                    <div className="mb-8">
                        <p className="text-gray-700 mb-4">
                            You are connected to a requester and they are seeking the following information
                        </p>

                        <div className="mb-3">
                            <p className="text-sm font-medium text-gray-600 mb-2">Requested information</p>
                            <div className="space-y-2">
                                {requestedScope.map((item) => (
                                    <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center">
                                        <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center mr-3">
                                            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                                        </div>
                                        <span className="text-gray-900 font-medium">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    <button
                        onClick={handleStart}
                        className="w-full bg-blue-600 text-white py-4 rounded-full font-medium text-lg hover:bg-blue-700 transition-colors"
                    >
                        Start
                    </button>
                    <button
                        onClick={handleDecline}
                        className="w-full text-red-600 py-4 font-medium text-lg hover:bg-red-50 transition-colors"
                    >
                        Decline Request
                    </button>
                </div>
            </div>
        </div>
    );
}