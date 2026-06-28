'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { getCurrentRequest, setSelectedCredentialId } from '@/lib/currentRequest';
import apiService from '@/services/apiService';
import walletService from '@/services/walletService';
import { useToast } from '@/contexts/ToastContext';
import { checkCredentialMatch, getMatchExplanation } from '@/lib/attributeMatcher';

interface CredentialAttribute {
    id: string;
    label: string;
    value?: string;
}

interface WalletCredential {
    id: string;
    title: string;
    organization: string;
    bgColor: string;
    pattern: string;
    attributes: CredentialAttribute[];
    credential_type: string;
    schema_id: string;
    anonymous_credential?: Record<string, unknown>;
    anonymous_master_secret?: string;
    ipfs_hash?: string;
    ipfs_gateway_url?: string;
    issuer_did?: string;
}

export default function CredentialSelectionPage() {
    const router = useRouter();
    const { addToast } = useToast();
    const [mounted, setMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCredential, setSelectedCredential] = useState<string | null>(null);
    const [requestedIds, setRequestedIds] = useState<string[]>([]);
    const [credentials, setCredentials] = useState<WalletCredential[]>([]);

    useEffect(() => {
        setMounted(true);
        
        // Get user DID
        const did = walletService.getCurrentDID();
        if (!did) {
            addToast('No wallet found. Please set up your wallet first.', 'error');
            router.push('/onboarding');
            return;
        }
        
        // Get requested scope
        const req = getCurrentRequest();
        if (req?.requestedScope) {
            const ids = req.requestedScope.map(s => s.id);
            setRequestedIds(ids);
            console.log('Requested attributes from verifier:', ids);
            console.log('Full requestedScope:', req.requestedScope);
        } else {
            console.warn('No requested scope found in presentation request');
        }
   
        fetchCredentials(did);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, addToast]);
    
    const fetchCredentials = async (did: string) => {
        setIsLoading(true);
        try {
            const response = await apiService.getCredentials(did);
            if (response.success && response.data) {
                interface CredentialResponse {
                    data?: unknown[];
                    credentials?: unknown[];
                }
                interface BackendCredential {
                    id?: string;
                    credential_type?: string;
                    type?: string;
                    issuer_did?: string;
                    schema_id?: string;
                    credential_preview?: Record<string, unknown>;
                    anonymous_credential?: Record<string, unknown>;
                    anonymous_master_secret?: string;
                    ipfs_hash?: string;
                    ipfs_gateway_url?: string;
                }
                const credResponse = response.data as CredentialResponse;
                const backendCreds = credResponse.data || credResponse.credentials || [];
                const transformedCreds: WalletCredential[] = (backendCreds as BackendCredential[])
                    .filter((cred) => cred && (cred as Record<string, unknown>).id) 
                    .map((cred, index: number) => {
                        // Extract attributes from flexible sources
                        const attributes: CredentialAttribute[] = [];
                        const credObj = cred as Record<string, unknown>;
                        const preview: Record<string, unknown> | null = (credObj.credential_preview as Record<string, unknown>)
                            || (credObj.credential_data as Record<string, unknown>)
                            || (credObj.preview as Record<string, unknown>)
                            || null;

                        if (preview && typeof preview === 'object' && !Array.isArray(preview)) {
                            Object.entries(preview).forEach(([key, value]) => {
                                if (key && value !== null && value !== undefined) {
                                    try {
                                        attributes.push({
                                            id: key.toLowerCase().replace(/\s+/g, '_'),
                                            label: key,
                                            value: String(value)
                                        });
                                    } catch (e) {
                                        console.warn('Failed to process attribute:', key, e);
                                    }
                                }
                            });
                        }

                        const issuerName = (credObj.issuer_name as string) || (credObj.issuer as string);
                        let organization = issuerName && issuerName.trim() ? issuerName.trim() : 'Unknown Issuer';
                        if ((!issuerName || !issuerName.trim()) && cred.issuer_did && typeof cred.issuer_did === 'string') {
                            const parts = cred.issuer_did.split(':');
                            if (parts.length >= 3 && parts[2]) {
                                organization = parts[2].slice(0, 30);
                            } else {
                                organization = cred.issuer_did;
                            }
                        }
                        
                        return {
                            id: (credObj.id as string) || `cred_${index}`,
                            title: (credObj.credential_type as string) || (credObj.type as string) || 'Verifiable Credential',
                            organization,
                            bgColor: 'bg-white border border-dark-100 shadow-sm',
                            pattern: '',
                            attributes,
                            credential_type: (credObj.credential_type as string) || (credObj.type as string) || '',
                            schema_id: (credObj.schema_id as string) || '',
                            anonymous_credential: credObj.anonymous_credential as Record<string, unknown> | undefined,
                            anonymous_master_secret: credObj.anonymous_master_secret as string | undefined,
                            ipfs_hash: credObj.ipfs_hash as string | undefined,
                            ipfs_gateway_url: credObj.ipfs_gateway_url as string | undefined,
                            issuer_did: credObj.issuer_did as string | undefined,
                        };
                    });
                
                setCredentials(transformedCreds);
                console.log('Fetched credentials:', transformedCreds.length);
                transformedCreds.forEach((cred, idx) => {
                    console.log(`[${idx}] ${cred.title}:`, cred.attributes.map(a => `${a.id}="${a.value}"`).join(', '));
                    console.log(`Attribute IDs: [${cred.attributes.map(a => a.id).join(', ')}]`);
                });
            } else {
                throw new Error(response.error || 'Failed to fetch credentials');
            }
        } catch (error) {
            console.error('Error fetching credentials:', error);
            addToast(
                error instanceof Error ? error.message : 'Failed to load credentials',
                'error'
            );
            // Set empty array on error
            setCredentials([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        router.push('/CredentialRequest');
    };

    const handleCredentialSelect = (credentialId: string) => {
        const cred = credentials.find(c => c.id === credentialId);
        if (!cred) return;
   
        const credAttrIds = cred.attributes.map(a => a.id);
        const matchResult = checkCredentialMatch(requestedIds, credAttrIds);
        
        console.log('Adaptive matching result:', {
            credential: cred.title,
            requested: requestedIds,
            available: credAttrIds,
            matchScore: matchResult.matchScore,
            canSatisfy: matchResult.canSatisfy,
            matched: matchResult.matchedAttributes,
            missing: matchResult.missingAttributes,
        });
        
        if (!matchResult.canSatisfy) {
            console.warn('Credential blocked, missing attributes:', matchResult.missingAttributes);
            return; 
        }
        
        console.log('Credential selected successfully');
        setSelectedCredential(credentialId);
        setSelectedCredentialId(credentialId);
    };

    const handleNext = () => {
        if (!selectedCredential) return;
        
        // Get the selected credential
        const credential = credentials.find(c => c.id === selectedCredential);
        if (!credential) return;
        
        // Get presentation request details
        const req = getCurrentRequest();
        
        // Store credential for AttributeConsent (ensure compatibility: include credential_preview)
        const previewFromAttributes: Record<string, unknown> = {};
        credential.attributes.forEach(a => {
          if (a.label) previewFromAttributes[a.label] = a.value ?? '';
        });
        const credentialWithPreview = { ...credential, credential_preview: previewFromAttributes } as Record<string, unknown>;
        sessionStorage.setItem('selected_credential_for_sharing', JSON.stringify(credentialWithPreview));
        
        // Convert presentation request to verifier requirements
        if (req) {
            const verifierRequirements = {
                request_id: req.requestId,
                verifier_name: req.requesterName || 'Unknown Verifier',
                verifier_did: req.requesterId,
                purpose: req.purposeHint || 'Credential verification',
                mandatory_attributes: req.requestedScope?.map(s => s.id) || [],
                optional_attributes: [],
            };
            console.log('Storing verifier_requirements with request_id:', verifierRequirements.request_id);
            sessionStorage.setItem('verifier_requirements', JSON.stringify(verifierRequirements));
        }

        router.push('/AttributeConsent');
    };

    if (!mounted || isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-light-50">
                <div className="text-center">
                    <Loader2 className="animate-spin h-10 w-10 text-primary-500 mx-auto mb-4" />
                    <p className="text-dark-500">Loading your credentials...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-light-50">
            <div className="bg-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
                <button onClick={handleBack} className="text-dark-400 hover:text-dark-600 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <div>
                    <h1 className="text-lg font-semibold text-dark-500">Information Request</h1>
                    <p className="text-xs text-dark-300">Choose a credential that satisfies the verifier requirements</p>
                </div>
            </div>

            <div className="p-6 pb-32 max-w-2xl mx-auto">
                {credentials.length === 0 ? (
                    <div className="text-center py-16 bg-white border border-dashed border-dark-100 rounded-xl">
                        <p className="text-dark-400 mb-2">No credentials found in your wallet.</p>
                        <p className="text-sm text-dark-300 mb-6">Request or import credentials before continuing.</p>
                        <button
                            onClick={() => router.push('/SSIWalletIdentity')}
                            className="text-primary-500 font-medium hover:underline"
                        >
                            Go to wallet
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-sm font-semibold text-dark-400 uppercase tracking-wide">
                                Your Credentials ({credentials.length})
                            </h2>
                            {requestedIds.length > 0 && (
                                <span className="px-3 py-1 bg-blue-100 text-primary-600 text-xs font-medium rounded-full">
                                    {requestedIds.length} required attribute{requestedIds.length > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        <div className="space-y-3">
                            {credentials.map((credential, index) => {
                                const credAttrIds = credential.attributes.map(a => a.id);
                                const matchResult = checkCredentialMatch(requestedIds, credAttrIds);
                                const disabled = requestedIds.length > 0 && !matchResult.canSatisfy;
                                const matchExplanation = requestedIds.length > 0 ? getMatchExplanation(matchResult) : '';

                                const cardStateClasses = selectedCredential === credential.id
                                    ? 'border-primary-500 bg-primary-50 shadow-lg'
                                    : 'border-dark-100 hover:border-primary-300 hover:shadow-md';

                                return (
                                    <div
                                        key={credential.id}
                                        onClick={() => {
                                            if (!disabled) {
                                                handleCredentialSelect(credential.id);
                                            }
                                        }}
                                        className={`relative bg-white rounded-xl border-2 p-5 transition-all ${
                                            disabled
                                                ? 'opacity-60 cursor-not-allowed'
                                                : `cursor-pointer ${cardStateClasses}`
                                        }`}
                                    >
                                        {selectedCredential === credential.id}

                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-dark-400 uppercase tracking-wide mb-1">
                                                        {credential.organization}
                                                    </p>
                                                    <h3 className="text-lg font-semibold text-dark-500 truncate">
                                                        {credential.title}
                                                    </h3>
                                                    <p className="text-xs text-dark-300">Credential #{index + 1}</p>
                                                </div>

                                                {!disabled && (
                                                    <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-green-50 text-green-600 text-xs font-semibold">
                                                        Ready
                                                    </span>
                                                )}
                                            </div>

                                            {requestedIds.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span
                                                        className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold ${
                                                            matchResult.matchScore === 100
                                                                ? 'bg-green-100 text-green-700'
                                                                : matchResult.matchScore >= 50
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : 'bg-red-100 text-red-700'
                                                        }`}
                                                    >
                                                        {matchExplanation}
                                                    </span>
                                                    {matchResult.matchedAttributes.length > 0 && (
                                                        <span className="text-xs text-dark-300">
                                                            Matched {matchResult.matchedAttributes.length} of {requestedIds.length}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {credentials.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white">
                    <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
                        <div className="text-sm text-dark-300">
                            {selectedCredential ? 'Ready to continue' : 'Select a credential to continue'}
                        </div>
                        <button
                            onClick={handleNext}
                            disabled={!selectedCredential}
                            className={`px-6 py-3 rounded-full font-semibold text-sm transition-all ${
                                selectedCredential
                                    ? 'bg-primary-500 text-white hover:bg-primary-600 active:scale-95 shadow-md'
                                    : 'bg-dark-200 text-dark-100 cursor-not-allowed'
                            }`}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}