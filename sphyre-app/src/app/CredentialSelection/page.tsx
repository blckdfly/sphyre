'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { getCurrentRequest, setSelectedCredentialId } from '@/lib/currentRequest';
import { listWalletCredentials, WalletCredential } from '@/lib/credentials';

export default function CredentialSelectionPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [selectedCredential, setSelectedCredential] = useState<string | null>(null);
    const [requestedIds, setRequestedIds] = useState<string[]>([]);

    useEffect(() => {
        setMounted(true);
        const req = getCurrentRequest();
        if (req?.requestedScope) {
            setRequestedIds(req.requestedScope.map(s => s.id));
        }
    }, []);

    const credentials: WalletCredential[] = useMemo(() => listWalletCredentials(), []);

    const handleBack = () => {
        router.push('/CredentialRequest');
    };

    const handleCredentialSelect = (credentialId: string) => {
        const cred = credentials.find(c => c.id === credentialId);
        if (!cred) return;
        // only allow selection if credential covers all requested attributes
        const credAttrIds = new Set(cred.attributes.map(a => a.id));
        const canSatisfy = requestedIds.every(id => credAttrIds.has(id));
        if (!canSatisfy) return; // block selection
        setSelectedCredential(credentialId);
        setSelectedCredentialId(credentialId);
    };

    const handleNext = () => {
        if (selectedCredential) {
            router.push('/CredentialConfirmation');
        }
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
                <button onClick={handleBack} className="mr-3">
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <h1 className="text-lg font-medium text-gray-900">Information Request</h1>
            </div>

            {/* Content */}
            <div className="flex-1 px-6 py-8 flex flex-col">
                <div className="flex-1">
                    <h2 className="text-2xl font-semibold text-gray-900 mb-8">
                        Make your selection
                    </h2>

                    <div className="mb-6">
                        <div className="flex justify-end mb-4">
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full font-medium">
                                Required information
                            </span>
                        </div>

                        <div className="space-y-4">
                            {credentials.map((credential) => {
                                const credAttrIds = new Set(credential.attributes.map(a => a.id));
                                const canSatisfy = requestedIds.every(id => credAttrIds.has(id));
                                const disabled = requestedIds.length > 0 && !canSatisfy;
                                return (
                                    <div
                                        key={credential.id}
                                        onClick={() => handleCredentialSelect(credential.id)}
                                        className={`relative overflow-hidden rounded-2xl transition-all ${
                                            disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'
                                        } ${selectedCredential === credential.id ? 'ring-2 ring-blue-500' : ''}`}
                                    >
                                        <div className={`${credential.bgColor} p-6 text-white relative`}>
                                            {/* Background Pattern */}
                                            <div className={`absolute inset-0 ${credential.pattern}`}>
                                                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                                            </div>

                                            {/* Content */}
                                            <div className="relative z-10">
                                                <h3 className="font-semibold text-lg mb-1">{credential.title}</h3>
                                                <p className="text-sm opacity-90 mb-4">{credential.organization}</p>

                                                {/* Bottom Row */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-2">
                                                        {requestedIds.length > 0 && (
                                                            <span className={`text-xs px-2 py-1 rounded-full ${disabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                                {disabled ? 'Does not meet the request' : 'Meets the request'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        {!disabled && <div className="w-3 h-3 bg-green-400 rounded-full"></div>}
                                                        <ChevronRight size={16} className="text-white/80" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Next Button */}
                <div className="pt-4">
                    <button
                        onClick={handleNext}
                        disabled={!selectedCredential}
                        className={`w-full py-4 rounded-full font-medium text-lg transition-colors ${
                            selectedCredential
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}