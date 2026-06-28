'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { X, Loader2, Shield, Lock } from 'lucide-react';
import { ConsentScopeItem } from '@/lib/consent';
import { setCurrentRequest } from '@/lib/currentRequest';
import walletService from '@/services/walletService';
import apiService from '@/services/apiService';
import { useToast } from '@/contexts/ToastContext';

interface PredicateRequirement {
    attribute: string;
    operator: string;
    value: number;
    predicate_type?: string;
}

interface PresentationRequest {
    type?: string;
    verifier?: {
        name?: string;
        did?: string;
    };
    requestedCredentials?: string[];
    required_predicates?: PredicateRequirement[];
    requested_attributes?: string[];
    purpose?: string;
    [key: string]: unknown;
}

export default function CredentialRequestPage() {
    const router = useRouter();
    const { addToast } = useToast();
    const [mounted, setMounted] = useState(false);
    const [isLoadingVerifier, setIsLoadingVerifier] = useState(false);
    const [presentationRequest, setPresentationRequest] = useState<PresentationRequest | null>(null);
    const [userDID, setUserDID] = useState<string | null>(null);
    const [verifierInfo, setVerifierInfo] = useState<{ name: string; did: string } | null>(null);

    const requestedScope: ConsentScopeItem[] = useMemo(() => {
        interface RequiredCredential {
            credential_type?: string;
            issuer_did?: string;
            required_attributes?: string[];
            predicate?: unknown;
        }
        interface RequestWithRequired {
            required_credentials?: RequiredCredential[];
            required_attributes?: string[];
            requested_credentials?: string[];
            requestedAttributes?: string[]; 
        }
        const req = (presentationRequest || {}) as RequestWithRequired;
        let attributes: string[] = [];

        if (Array.isArray(req.required_credentials) && req.required_credentials.length > 0) {
            for (const rc of req.required_credentials) {
                if (Array.isArray(rc.required_attributes)) {
                    attributes.push(...rc.required_attributes);
                }
            }
        }
        // Fallbacks
        if (attributes.length === 0 && Array.isArray(req.required_attributes)) {
            attributes = req.required_attributes;
        }
        if (attributes.length === 0) {
            const legacy = (presentationRequest as unknown as { requestedCredentials?: string[] })?.requestedCredentials
                || req.requested_credentials
                || req.requestedAttributes
                || [];
            if (Array.isArray(legacy)) attributes = legacy;
        }

        const unique = Array.from(new Set(attributes.filter(Boolean)));
        if (unique.length > 0) {
            return unique.map((name: string) => ({
                id: name.toLowerCase().replace(/\s+/g, '_'),
                label: name,
            }));
        }
        return [];
    }, [presentationRequest]);

    interface RequestWithVerifierDid {
        verifier_did?: string;
        verifierDID?: string;
    }
    const reqWithVerifierDid = presentationRequest as RequestWithVerifierDid;
    const requesterId = verifierInfo?.did || 
                       presentationRequest?.verifier?.did || 
                       reqWithVerifierDid?.verifier_did ||
                       reqWithVerifierDid?.verifierDID ||
                       'unknown_verifier';
    
    interface RequestWithVerifierName {
        verifierName?: string;
    }
    const reqWithVerifierName = presentationRequest as RequestWithVerifierName;
    const requesterName = verifierInfo?.name || 
                         presentationRequest?.verifier?.name || 
                         reqWithVerifierName?.verifierName ||
                         'Verifier';

    useEffect(() => {
        setMounted(true);
        
        // Get user's DID
        const did = walletService.getCurrentDID();
        if (did) {
            setUserDID(did);
        } else {
            addToast('No wallet found. Please set up your wallet first.', 'error');
            router.push('/onboarding');
            return;
        }
        
        // Get presentation request from sessionStorage
        const requestData = sessionStorage.getItem('presentation_request');
        if (requestData) {
            try {
                const request = JSON.parse(requestData);
                setPresentationRequest(request);
                console.log('Presentation request loaded:', request);
                
                // Fetch verifier info if verifier DID available
                const verifierDid = request.verifier?.did || 
                                   request.verifier_did || 
                                   request.verifierDID;
                if (verifierDid) {
                    fetchVerifierInfo(verifierDid);
                }
            } catch (error) {
                console.error('Failed to parse presentation request:', error);
                addToast('Invalid presentation request data', 'error');
            }
        } else {
            addToast('No presentation request found', 'warning');
        }
    }, [router, addToast]);
    
    const fetchVerifierInfo = async (verifierDid: string) => {
        setIsLoadingVerifier(true);
        try {
            const response = await apiService.getVerifierInfo(verifierDid);
            if (response.success && response.data) {
                const dataObj = response.data as Record<string, unknown>;
                const verifierObj = (dataObj.verifier as Record<string, unknown>) || dataObj;
                const name: string = (verifierObj?.name as string) || verifierDid;
                setVerifierInfo({ name, did: verifierDid });
            }
        } catch (error) {
            console.error('Failed to fetch verifier info:', error);
        } finally {
            setIsLoadingVerifier(false);
        }
    };
    
    useEffect(() => {
        setCurrentRequest({
            requestId: (presentationRequest as { request_id?: string; id?: string })?.request_id || 
                      (presentationRequest as { request_id?: string; id?: string })?.id,
            requesterId,
            requesterName,
            requestedScope,
            purposeHint: presentationRequest?.purpose || 'Service access verification',
        });
    }, [requestedScope, requesterId, requesterName, presentationRequest]);

    const handleStart = () => {
        console.log('Starting credential presentation with DID:', userDID);
        console.log('Presentation request:', presentationRequest);
        
        // Store user DID for credential selection
        if (userDID) {
            sessionStorage.setItem('user_did', userDID);
            sessionStorage.setItem('holder_did_for_presentation', userDID);
        }
        
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
            <div className="flex items-center justify-center h-screen bg-light-50">
                <p className="text-dark-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center">
                <button onClick={handleClose} className="mr-3">
                    <X size={24} className="text-dark-300" />
                </button>
                <h1 className="text-lg font-medium text-dark-500">Information Request</h1>
            </div>

            {/* Content */}
            <div className="flex-1 px-6 py-8 flex flex-col">
                <div className="flex-1">
                    <h2 className="text-2xl font-semibold text-dark-500 mb-6 leading-tight">
                        You have received a request to present credentials
                    </h2>

                    {/* Connection Visual */}
                    <div className="flex items-center justify-center mb-10">
                        <div className="relative w-56 h-56">
                            {/* Outer orbit */}
                            <div className="absolute inset-0 rounded-full border border-primary-200/60 bg-gradient-to-br from-white via-primary-50/40 to-white shadow-[0_12px_32px_rgba(30,64,175,0.08)]"></div>

                            {/* Inner orbit */}
                            <div className="absolute inset-6 rounded-full border border-primary-100/40"></div>

                            {/* Sphyre badge */}
                            <div className="absolute -left-7 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white border border-primary-100 shadow-[0_12px_24px_rgba(59,130,246,0.18)] flex items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 via-primary-500 to-primary-400 text-white font-semibold text-lg flex items-center justify-center">
                                    <Image
                                        src="/icons/sphyre.svg"
                                        alt="Sphyre logo"
                                        width={32}
                                        height={32}
                                        className="w-8 h-8"
                                        priority
                                    />
                                </div>
                            </div>

                            {/* Verifier badge */}
                            <div className="absolute -right-7 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white border border-teal-200 shadow-[0_12px_24px_rgba(20,184,166,0.18)] flex items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-600 via-teal-500 to-teal-400 text-white text-sm font-semibold flex items-center justify-center">
                                    {isLoadingVerifier ? (
                                        <Loader2 className="animate-spin" size={18} />
                                    ) : (
                                        requesterName
                                            .split(' ')
                                            .map((part) => part[0])
                                            .join('')
                                            .slice(0, 2)
                                            .toUpperCase()
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Request Info */}
                    <div className="mb-8">
                        <p className="text-dark-500 mb-4">
                            <span className="font-semibold">{requesterName}</span> is requesting the following information
                        </p>

                        {presentationRequest?.required_predicates && presentationRequest.required_predicates.length > 0 && (
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <Shield size={16} className="text-purple-600" />
                                    <p className="text-sm font-medium text-dark-500">Zero-Knowledge Predicates (Automatically Proven)</p>
                                </div>
                                <div className="space-y-2">
                                    {presentationRequest.required_predicates.map((pred, idx) => (
                                        <div key={idx} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Lock size={14} className="text-purple-600" />
                                                <span className="text-sm font-medium text-purple-900">
                                                    {pred.attribute} {pred.operator} {pred.value}: PROVEN
                                                </span>
                                            </div>
                                            <p className="text-xs text-purple-700 ml-6">
                                                Actual value NOT revealed (cryptographic proof only)
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mb-3">
                            <p className="text-sm font-medium text-dark-300 mb-2">Requested information</p>
                            {requestedScope.length === 0 ? (
                                <div className="text-center py-6 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-amber-700 text-sm">No specific information requested</p>
                                </div>
                            ) : (
                            <div className="space-y-2">
                                {requestedScope.map((item) => (
                                    <div key={item.id} className="bg-white rounded-lg border border-dark-100 p-4 flex items-center">
                                        <div className="w-6 h-6 bg-light-200 rounded flex items-center justify-center mr-3">
                                            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                                        </div>
                                        <span className="text-dark-500 font-medium">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    <button
                        onClick={handleStart}
                        className="w-full bg-primary-500 text-white py-4 rounded-full font-medium text-lg hover:bg-primary-600 transition-colors"
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