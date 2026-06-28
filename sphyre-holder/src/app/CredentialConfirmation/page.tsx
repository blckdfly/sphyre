'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, CheckCircle2, CalendarClock } from 'lucide-react';
import { ConsentRecord, ConsentScopeItem, listConsents, upsertConsent, findActiveConsentByRequesterAndScope } from '@/lib/consent';
import { getCurrentRequest } from '@/lib/currentRequest';
import { storeVerificationFailure, buildFailureData, toOptionalString } from '@/utils/verificationHelpers';
import { listWalletCredentials, WalletCredential } from '@/lib/credentials';
import apiService from '@/services/apiService';
import walletService from '@/services/walletService';

type ExpiryChoice = '24h' | '7d' | '30d' | '90d' | 'custom' | 'never';

interface PredicateRequirement {
    attribute: string;
    operator: string;
    value: number;
    predicate_type?: string;
}

interface PredicateProofPayload {
  attribute_name: string;
  predicate_type: string;
  predicate_value: number;
  range_proof: {
    proof: string;
    commitment: string;
  };
}

interface ZKProofResponse {
  success: boolean;
  proof: PredicateProofPayload;
  message?: string;
}

const EXPIRY_OPTIONS: { value: ExpiryChoice; label: string; description: string }[] = [
    { value: '24h', label: '24 hours', description: 'Grant access for one day' },
    { value: '7d', label: '7 days', description: 'Great for short-term checks' },
    { value: '30d', label: '30 days', description: 'Recommended default period' },
    { value: '90d', label: '90 days', description: 'Extended access window' },
    { value: 'custom', label: 'Custom date & time', description: 'Pick exact expiration' },
    { value: 'never', label: 'Never expires', description: 'Manual revocation required' },
];

const EXPIRY_CHOICE_VALUES = new Set<ExpiryChoice>(EXPIRY_OPTIONS.map((option) => option.value));

function calculateConsentExpiry(
    choice: ExpiryChoice,
    customValue: string,
    referenceDate: Date = new Date(),
): { iso: string | null; error?: string } {
    const nowMs = referenceDate.getTime();
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;

    switch (choice) {
        case '24h':
            return { iso: new Date(nowMs + 24 * hourMs).toISOString() };
        case '7d':
            return { iso: new Date(nowMs + 7 * dayMs).toISOString() };
        case '30d':
            return { iso: new Date(nowMs + 30 * dayMs).toISOString() };
        case '90d':
            return { iso: new Date(nowMs + 90 * dayMs).toISOString() };
        case 'never':
            return { iso: null };
        case 'custom': {
            if (!customValue) {
                return { iso: null, error: 'Please choose an expiration date and time for consent.' };
            }
            const customDate = new Date(customValue);
            if (Number.isNaN(customDate.getTime())) {
                return { iso: null, error: 'Invalid custom expiration date. Please select a valid timestamp.' };
            }
            if (customDate.getTime() <= nowMs + 60 * 1000) {
                return { iso: null, error: 'Expiration must be at least one minute in the future.' };
            }
            return { iso: customDate.toISOString() };
        }
        default:
            return { iso: null };
    }
}

function describeExpirySelection(choice: ExpiryChoice, customValue: string): string {
    if (choice === 'never') {
        return 'Never expires — you can revoke consent anytime from settings.';
    }

    const { iso, error } = calculateConsentExpiry(choice, customValue);
    if (error) {
        return error;
    }
    if (!iso) {
        return 'No expiration selected.';
    }

    const expiryDate = new Date(iso);
    const now = Date.now();
    const diffMs = expiryDate.getTime() - now;

    const absolute = expiryDate.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    if (diffMs <= 0) {
        return `Expired on ${absolute}`;
    }

    const minutes = Math.round(diffMs / (60 * 1000));
    const hours = Math.round(diffMs / (60 * 60 * 1000));
    const days = Math.round(diffMs / (24 * 60 * 60 * 1000));

    let relative = '';
    if (minutes < 120) {
        relative = `in ${Math.max(minutes, 1)} minutes`;
    } else if (hours < 48) {
        relative = `in ${hours} hours`;
    } else {
        relative = `in ${days} days`;
    }

    return `Expires ${relative} (${absolute})`;
}

function formatDateTimeLocalInputValue(date: Date): string {
    const tzOffset = date.getTimezoneOffset() * 60 * 1000;
    const localDate = new Date(date.getTime() - tzOffset);
    return localDate.toISOString().slice(0, 16);
}

export default function CredentialConfirmationPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const [requesterId, setRequesterId] = useState('');
    const [requesterName, setRequesterName] = useState('Verifier');
    const [scope, setScope] = useState<ConsentScopeItem[]>([
        { id: 'age_over_21', label: 'Age verification (over 21)' },
        { id: 'employee_status', label: 'Employment status' },
        { id: 'org_affiliation', label: 'Organizational affiliation' },
    ]);

    const [rememberConsent, setRememberConsent] = useState(true);
    const [purpose, setPurpose] = useState('Service access verification');
    const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
    const [coveredByExistingConsent, setCoveredByExistingConsent] = useState(false);
    const [selectedCredential, setSelectedCredential] = useState<WalletCredential | null>(null);
    const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>('30d');
    const [customExpiry, setCustomExpiry] = useState('');
    const [initialExpiryHydrated, setInitialExpiryHydrated] = useState(false);

    useEffect(() => {
        setMounted(true);
        const req = getCurrentRequest();
        if (req) {
            setRequesterId(req.requesterId);
            setRequesterName(req.requesterName);
            const creds = listWalletCredentials();
            const cred = creds.find(c => c.id === req.selectedCredentialId) || null;
            setSelectedCredential(cred);

            const requested = req.requestedScope || [];
            if (cred) {
                const credAttrIds = new Set(cred.attributes.map(a => a.id));
                const intersection: ConsentScopeItem[] = requested.filter(s => credAttrIds.has(s.id));
                setScope(intersection);
                setSelectedScopeIds(intersection.map(s => s.id));
            } else {
                setScope(requested);
                setSelectedScopeIds(requested.map(s => s.id));
            }

            if (req.purposeHint) setPurpose(req.purposeHint);
            const ids = requested.map(s => s.id);
            const full = !!findActiveConsentByRequesterAndScope(req.requesterId, ids);
            setCoveredByExistingConsent(full);
            if (full) setRememberConsent(false);
        } else {
            // default selection = all
            setSelectedScopeIds(scope.map((s) => s.id));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // Auto-detect existing active consent and pre-fill (per-attribute)
        const now = Date.now();
        const activeForRequester = listConsents().filter(
            (c) => c.active && c.requesterId === requesterId && (!c.expiresAt || c.expiresAt >= now)
        );
        if (activeForRequester.length > 0) {
            // If not covered fully, still pre-check previously granted attributes
            const granted = new Set<string>();
            activeForRequester.forEach((c) => c.scope.forEach((s) => granted.add(s.id)));
            const allowed = scope.map((s) => s.id).filter((id) => granted.has(id));
            if (allowed.length > 0) {
                setSelectedScopeIds((prev) => prev.length ? prev : allowed);
            }
            // Use existing purpose as a sensible default if not provided by requester
            setPurpose((prev) => prev || activeForRequester[0].purpose);
            if (!initialExpiryHydrated) {
                const earliestExpiry = activeForRequester
                    .map((c) => c.expiresAt)
                    .filter(Boolean)
                    .sort((a, b) => (a ?? Infinity) - (b ?? Infinity))[0];
                if (earliestExpiry) {
                    const expiresAtIso = new Date(earliestExpiry).toISOString();
                    setCustomExpiry(expiresAtIso.slice(0, 16));
                    setExpiryChoice('custom');
                } else {
                    setExpiryChoice('never');
                }
                setInitialExpiryHydrated(true);
            }
        }
    }, [requesterId, scope, initialExpiryHydrated]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const storedChoice = sessionStorage.getItem('consent_expiry_choice');
        if (storedChoice && EXPIRY_CHOICE_VALUES.has(storedChoice as ExpiryChoice)) {
            setExpiryChoice(storedChoice as ExpiryChoice);
        }
        const storedCustom = sessionStorage.getItem('consent_expiry_custom');
        if (storedCustom) {
            setCustomExpiry(storedCustom);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        sessionStorage.setItem('consent_expiry_choice', expiryChoice);
    }, [expiryChoice]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (customExpiry) {
            sessionStorage.setItem('consent_expiry_custom', customExpiry);
        } else {
            sessionStorage.removeItem('consent_expiry_custom');
        }
    }, [customExpiry]);

    const handleBack = () => {
        router.push('/CredentialSelection');
    };

    const handleConfirm = async () => {
        setIsProcessing(true);

        const { iso: consentExpiresAtIso, error: expiryError } = calculateConsentExpiry(expiryChoice, customExpiry);
        if (expiryError) {
            alert(expiryError);
            setIsProcessing(false);
            return;
        }

        try {
            const selectedScope = scope.filter((s) => selectedScopeIds.includes(s.id));
            if (selectedScope.length === 0) {
                alert('Select at least one attribute to continue.');
                setIsProcessing(false);
                return;
            }

            const holderDID = walletService.getCurrentDID();
            if (!holderDID) {
                alert('No wallet found. Please set up your wallet first.');
                router.push('/onboarding');
                setIsProcessing(false);
                return;
            }

            const expiresAt = consentExpiresAtIso ? new Date(consentExpiresAtIso).getTime() : undefined;
            const consentRecordId = `${requesterId}:${selectedScopeIds.join(',')}`;
            const consentPayload = {
                verifier_did: requesterId,
                purpose,
                data_categories: selectedScope.map((s) => s.id),
                access_level: 'read_only',
                expiration_policy: consentExpiresAtIso ? 'fixed_date' : 'indefinite',
                expires_at: consentExpiresAtIso,
            };

            // Persist locally only if the user wants to remember it
            if (rememberConsent) {
                const record: ConsentRecord = {
                    id: consentRecordId,
                    requesterId,
                    requesterName,
                    purpose,
                    scope: selectedScope,
                    createdAt: Date.now(),
                    expiresAt,
                    active: true,
                };
                upsertConsent(record);
            }

            // Always sync consent to backend so it appears in Consent Management
            try {
                const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';
                console.log('Syncing consent to backend:', consentPayload);

                const consentResponse = await fetch(`${API_URL}/api/wallet/${holderDID}/consents`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-DID': holderDID,
                    },
                    body: JSON.stringify(consentPayload),
                });

                if (consentResponse.ok) {
                    const consentResult = await consentResponse.json();
                    console.log('Consent synced to backend:', consentResult);
                } else {
                    console.warn('Failed to sync consent to backend (continuing anyway)');
                }
            } catch (error) {
                console.error('Error syncing consent to backend:', error);
            }

            // Get presentation request from sessionStorage
            const presentationRequestData = sessionStorage.getItem('presentation_request');
            if (!presentationRequestData) {
                alert('No presentation request found');
                router.push('/SSIWalletIdentity');
                return;
            }

            const presentationRequest = JSON.parse(presentationRequestData);
            const requestId = presentationRequest.request_id || presentationRequest.id;

            if (!requestId) {
                const failurePayload = buildFailureData(
                    {
                        credential_type: selectedCredential?.title || 'Unknown',
                        verifier_name: requesterName || 'Verifier',
                        verifier_did: requesterId,
                    },
                    {
                        reason: 'Missing presentation context. Please rescan or start over.',
                        error_code: 'MISSING_PRESENTATION_REQUEST',
                    },
                    'Verification failed',
                );
                storeVerificationFailure(failurePayload);
                router.push('/VerificationFailure');
                return;
            }

            const zkProofs: PredicateProofPayload[] = [];
            const predicates: PredicateRequirement[] =
                (presentationRequest.required_predicates as PredicateRequirement[]) ??
                (presentationRequest.requiredPredicates as PredicateRequirement[]) ??
                [];
            
            if (predicates.length > 0 && selectedCredential) {
                const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';
                
                console.log('Processing predicate requirements (merged):', predicates);
                for (const pred of predicates) {
                    try {
                        console.log(`Generating ZK proof for ${pred.attribute} ${pred.operator} ${pred.value}`);
                        
                        const response = await fetch(
                            `${API_URL}/api/wallet/credentials/${selectedCredential.id}/predicate-proof`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    attribute: pred.attribute,
                                    operator: pred.operator,
                                    value: pred.value,
                                }),
                            }
                        );
                        
                        if (response.ok) {
                            const proof = (await response.json()) as ZKProofResponse;
                            if (!proof?.proof) {
                                throw new Error('Predicate proof payload missing `proof` field');
                            }
                            zkProofs.push(proof.proof);
                            console.log('ZK proof generated:', proof);
                        } else {
                            const errorText = await response.text();
                            console.error('ZKP generation failed:', response.statusText, errorText);
                            const failurePayload = buildFailureData(
                                {
                                    credential_type: selectedCredential?.title || 'Unknown',
                                    verifier_name: requesterName || 'Verifier',
                                    verifier_did: requesterId,
                                },
                                {
                                    reason: `Failed to generate zero-knowledge proof for ${pred.attribute}: ${response.status} ${errorText}`,
                                    error_code: 'PREDICATE_PROOF_FAILED',
                                },
                                'Verification failed',
                            );
                            storeVerificationFailure(failurePayload);
                            sessionStorage.removeItem('presentation_request');
                            router.push('/VerificationFailure');
                            return;
                        }
                    } catch (error) {
                        console.error('ZKP generation error:', error);
                        const userFriendlyReason =
                            error instanceof Error && error.message.includes('does not satisfy predicate')
                                ? 'Your credential does not meet the verifier requirement.'
                                : (error instanceof Error && toOptionalString(error.message))
                                    ? error.message
                                    : 'Failed to generate zero-knowledge proof';

                        // Notify verifier so status becomes rejected (avoid stuck pending)
                        try {
                            if (requestId && holderDID) {
                                const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';
                                await fetch(
                                    `${API_URL}/api/wallet/presentation-requests/${requestId}/reject`,
                                    {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            holder_did: holderDID,
                                            reason: userFriendlyReason,
                                            error_code: 'PREDICATE_PROOF_ERROR',
                                        }),
                                    }
                                ).catch((err) => console.warn('Failed to notify verifier about rejection:', err));
                            }
                        } catch (err) {
                            console.warn('Failed to process rejection notification:', err);
                        }

                        const failurePayload = buildFailureData(
                            {
                                credential_type: selectedCredential?.title || 'Unknown',
                                verifier_name: requesterName || 'Verifier',
                                verifier_did: requesterId,
                            },
                            {
                                reason: userFriendlyReason,
                                error_code: 'PREDICATE_PROOF_ERROR',
                            },
                            'Verification failed',
                        );
                        storeVerificationFailure(failurePayload);
                        sessionStorage.removeItem('presentation_request');
                        router.push('/VerificationFailure');
                        return;
                    }
                }
            }

            const credentials = selectedCredential ? [
                {
                    id: selectedCredential.id,
                    title: selectedCredential.title,
                    organization: selectedCredential.organization,
                    attributes: selectedCredential.attributes.filter(attr => 
                        selectedScopeIds.includes(attr.id)
                    ),
                    type: 'VerifiableCredential',
                    holder_did: holderDID,
                }
            ] : [];

            const response = await apiService.submitPresentation({
                request_id: requestId,
                holder_did: holderDID,
                credentials,
                zk_proofs: zkProofs.length > 0 ? zkProofs : undefined,
                consent_id: rememberConsent ? `${requesterId}:${selectedScopeIds.join(',')}` : undefined,
                consent_expires_at: consentExpiresAtIso || undefined,
            });

            if (response.success) {
                console.log('Credentials shared successfully!');
                sessionStorage.removeItem('presentation_request');
                router.push('/VerificationSuccess');
            } else {
                const responseObj = response as unknown as Record<string, unknown>;
                const failurePayload = buildFailureData(
                    {
                        credential_type: selectedCredential?.title || 'Unknown',
                        verifier_name: requesterName || 'Verifier',
                        verifier_did: requesterId,
                    },
                    {
                        reason: toOptionalString(responseObj.reason) || toOptionalString(responseObj.message) || toOptionalString(responseObj.error),
                        error_code: toOptionalString(responseObj.error_code) ?? null,
                        details: responseObj.details,
                    },
                    'Failed to share credentials',
                );

                storeVerificationFailure(failurePayload);
                sessionStorage.removeItem('presentation_request');
                
                router.push('/VerificationFailure');
            }
        } catch (error) {
            console.error('Error sharing credentials:', error);

            const failurePayload = buildFailureData(
                {
                    credential_type: selectedCredential?.title || 'Unknown',
                    verifier_name: requesterName || 'Verifier',
                    verifier_did: requesterId,
                },
                {
                    reason:
                        error instanceof Error && toOptionalString(error.message)
                            ? error.message
                            : 'Failed to share credentials',
                    error_code: 'PRESENTATION_ERROR',
                },
            );
            storeVerificationFailure(failurePayload);
            sessionStorage.removeItem('presentation_request');
            
            router.push('/VerificationFailure');
        }
    };

    const handleCancel = () => {
        router.push('/SSIWalletIdentity');
    };

    const expirySummary = useMemo(
        () => describeExpirySelection(expiryChoice, customExpiry),
        [expiryChoice, customExpiry]
    );

    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-screen bg-light-50">
                <p className="text-dark-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto min-h-screen bg-light-100 flex flex-col">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center border-b border-dark-100">
                <button onClick={handleBack} className="mr-3">
                    <ArrowLeft size={24} className="text-dark-300" />
                </button>
                <h1 className="text-lg font-medium text-dark-500">Confirmation & Consent</h1>
            </div>

            {/* Content */}
            <div className="flex-1 px-6 py-8 flex flex-col">
                <div className="flex-1">
                    <h2 className="text-2xl font-semibold text-dark-500 mb-8">
                        Review data and provide consent
                    </h2>

                    {coveredByExistingConsent && (
                        <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
This request is fully covered by your active consent. You can share immediately or adjust the scope if needed.
                        </div>
                    )}

                    {/* Selected Credential Preview */}
                    <div className="mb-8">
                        <div className="relative overflow-hidden rounded-2xl">
                            <div className={`${selectedCredential ? selectedCredential.bgColor : 'bg-gradient-to-br from-blue-600 to-blue-800'} p-6 text-white relative`}>
                                {/* Background Pattern */}
                                <div className={`absolute inset-0 ${selectedCredential ? selectedCredential.pattern : 'bg-primary-500/10'}`}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                                </div>

                                {/* Content */}
                                <div className="relative z-10">
                                    <h3 className="font-semibold text-lg mb-1">{selectedCredential ? selectedCredential.title : 'Lumera Employee Badge'}</h3>
                                    <p className="text-sm opacity-90 mb-4">{selectedCredential ? selectedCredential.organization : 'Lumera Labs'}</p>

                                    {/* Bottom Icons */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                                                <div className="w-3 h-3 bg-white/60 rounded-full"></div>
                                            </div>
                                            <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                                                <div className="w-3 h-3 bg-white/60 rounded-full"></div>
                                            </div>
                                            <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                                                <div className="w-3 h-3 bg-white/60 rounded-full"></div>
                                            </div>
                                            <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                                                <div className="w-3 h-3 bg-white/60 rounded-full"></div>
                                            </div>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                            <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sharing Information */}
                    <div className="bg-white rounded-lg border border-dark-100 p-6 mb-6">
                        <h3 className="font-semibold text-dark-500 mb-2">Data to be shared:</h3>
                        <p className="text-sm text-dark-300 mb-4">Select the attributes you want to share with the requester.</p>
                        <div className="space-y-2">
                            <label className="block text-sm text-dark-400">
                                Purpose of sharing
                            </label>
                            <input
                                type="text"
                                value={purpose}
                                onChange={(e) => setPurpose(e.target.value)}
                                className="w-full px-3 py-3 bg-light-200 border border-dark-100 rounded-lg text-black focus:outline-none mb-4"
                                placeholder="Example: service access verification"
                            />
                            <div className="mb-4">
                                <label className="inline-flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4"
                                        checked={selectedScopeIds.length === scope.length}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedScopeIds(scope.map((s) => s.id));
                                            } else {
                                                setSelectedScopeIds([]);
                                            }
                                        }}
                                    />
                                    <span className="text-sm text-dark-500">Select all</span>
                                </label>
                            </div>
                            <div className="space-y-3">
                                {scope.map((s) => (
                                    <label key={s.id} className="flex items-center justify-between p-3 border border-dark-100 rounded-lg">
                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 mr-3"
                                                checked={selectedScopeIds.includes(s.id)}
                                                onChange={(e) => {
                                                    setSelectedScopeIds((prev) => {
                                                        if (e.target.checked) return Array.from(new Set([...prev, s.id]));
                                                        return prev.filter((id) => id !== s.id);
                                                    });
                                                }}
                                            />
                                            <span className="text-dark-500">{s.label}</span>
                                        </div>
                                        {selectedScopeIds.includes(s.id) ? (
                                            <CheckCircle size={16} className="text-green-500" />
                                        ) : null}
                                    </label>
                                ))}
                            </div>
                            {selectedScopeIds.length === 0 && (
                                <p className="text-sm text-red-600 mt-3">Select at least one attribute to continue.</p>
                            )}
                        </div>
                    </div>

                    {/* Requester Information */}
                    <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 mb-6">
                        <h4 className="font-medium text-blue-900 mb-2">Shared with:</h4>
                        <div className="flex items-center">
                            <div className="w-8 h-8 bg-teal-700 rounded-full flex items-center justify-center mr-3">
                                <span className="text-white text-xs font-bold">A</span>
                            </div>
                            <div>
                                <p className="font-medium text-blue-900">{requesterName}</p>
                                <p className="text-sm text-primary-600">Trusted verifier</p>
                            </div>
                        </div>
                    </div>

                    {/* Consent Controls */}
                    <div className="bg-white rounded-lg border border-dark-100 p-6 mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-dark-500">Consent expiry</h3>
                            <span className="text-xs text-dark-300">Define how long this consent stays valid</span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {EXPIRY_OPTIONS.map((option) => {
                                const isActive = expiryChoice === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setExpiryChoice(option.value)}
                                        className={`text-left px-4 py-3 rounded-xl border transition-all ${
                                            isActive
                                                ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm'
                                                : 'border-dark-100 bg-white text-dark-400 hover:border-primary-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className={`text-sm font-semibold ${isActive ? 'text-primary-700' : 'text-dark-500'}`}>
                                                    {option.label}
                                                </p>
                                                <p className="text-xs text-dark-300 mt-1">{option.description}</p>
                                            </div>
                                            {isActive && (
                                                <CheckCircle2 size={18} className="text-primary-600 flex-shrink-0" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {expiryChoice === 'custom' && (
                            <div className="mt-3">
                                <label className="block text-xs font-medium text-dark-400 mb-1">
                                    Select expiration date & time
                                </label>
                                <input
                                    type="datetime-local"
                                    value={customExpiry}
                                    onChange={(e) => setCustomExpiry(e.target.value)}
                                    min={formatDateTimeLocalInputValue(new Date(Date.now() + 5 * 60 * 1000))}
                                    className="w-full px-3 py-2 border border-dark-200 rounded-lg text-dark-500 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                                <p className="text-xs text-dark-300 mt-1">
                                    Use your local timezone. Expiration must be in the future.
                                </p>
                            </div>
                        )}

                        <div className="mt-3 flex items-center gap-2 text-xs text-dark-400">
                            <CalendarClock size={14} />
                            <span>{expirySummary}</span>
                        </div>
                    </div>

                    {/* Consent Options */}
                    <div className="bg-white rounded-lg border border-dark-100 p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-dark-500">Consent options</h3>
                            <label className="flex items-center text-sm text-dark-400">
                                <input
                                    type="checkbox"
                                    checked={rememberConsent}
                                    onChange={(e) => setRememberConsent(e.target.checked)}
                                    className="w-4 h-4"
                                />
                                <span className="text-dark-500">Remember this consent for similar requests</span>
                            </label>
                        </div>
                        <label className="block text-sm text-dark-400 mb-1">
                            Purpose of data use
                        </label>
                        <input
                            type="text"
                            value={purpose}
                            onChange={(e) => setPurpose(e.target.value)}
                            className="w-full px-3 py-3 bg-light-200 border border-dark-100 rounded-lg text-black focus:outline-none mb-4"
                            placeholder="Example: service access verification"
                        />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    <button
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className={`w-full mt-6 py-4 flex items-center justify-center rounded-xl font-medium transition-all text-white ${
                            isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary-500 hover:bg-primary-600 active:scale-95'
                        }`}
                    >
                        {isProcessing ? 'Sharing...' : 'Agree & Share'}
                    </button>
                    <button
                        onClick={handleCancel}
                        className="w-full text-dark-300 py-4 font-medium text-lg hover:bg-light-200 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
