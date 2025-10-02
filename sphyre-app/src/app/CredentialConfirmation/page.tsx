'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { ConsentRecord, ConsentScopeItem, listConsents, upsertConsent, findActiveConsentByRequesterAndScope } from '@/lib/consent';
import { getCurrentRequest } from '@/lib/currentRequest';
import { listWalletCredentials, WalletCredential } from '@/lib/credentials';

export default function CredentialConfirmationPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Request context (fallback to demo if absent)
    const [requesterId, setRequesterId] = useState('aurora.verifier');
    const [requesterName, setRequesterName] = useState('Aurora Verifier');
    const [scope, setScope] = useState<ConsentScopeItem[]>([
        { id: 'age_over_21', label: 'Age verification (over 21)' },
        { id: 'employee_status', label: 'Employment status' },
        { id: 'org_affiliation', label: 'Organizational affiliation' },
    ]);

    const [rememberConsent, setRememberConsent] = useState(true);
    const [purpose, setPurpose] = useState('Service access verification');
    const [durationDays, setDurationDays] = useState(30);
    const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
    const [coveredByExistingConsent, setCoveredByExistingConsent] = useState(false);
    const [selectedCredential, setSelectedCredential] = useState<WalletCredential | null>(null);

    useEffect(() => {
        setMounted(true);
        const req = getCurrentRequest();
        if (req) {
            setRequesterId(req.requesterId);
            setRequesterName(req.requesterName);
            // Determine selected credential and intersect attributes with requested scope
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
                // fallback to requested scope when no credential selection is found
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
        }
    }, [requesterId, scope]);

    const handleBack = () => {
        router.push('/CredentialSelection');
    };

    const handleConfirm = async () => {
        setIsProcessing(true);

        const selectedScope = scope.filter((s) => selectedScopeIds.includes(s.id));

        if (rememberConsent && selectedScope.length > 0) {
            const now = Date.now();
            const expiresAt = durationDays > 0 ? now + durationDays * 24 * 60 * 60 * 1000 : undefined;
            const record: ConsentRecord = {
                id: `${requesterId}:${selectedScopeIds.join(',')}`,
                requesterId,
                requesterName,
                purpose,
                scope: selectedScope,
                createdAt: now,
                expiresAt,
                active: true,
            };
            upsertConsent(record);
        }

        // Simulate API call (share only selected attributes)
        await new Promise((resolve) => setTimeout(resolve, 1200));

        alert('Credentials shared successfully!');
        router.push('/SSIWalletIdentity');
    };

    const handleCancel = () => {
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
                <button onClick={handleBack} className="mr-3">
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <h1 className="text-lg font-medium text-gray-900">Confirmation & Consent</h1>
            </div>

            {/* Content */}
            <div className="flex-1 px-6 py-8 flex flex-col">
                <div className="flex-1">
                    <h2 className="text-2xl font-semibold text-gray-900 mb-8">
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
                                <div className={`absolute inset-0 ${selectedCredential ? selectedCredential.pattern : 'bg-blue-500/10'}`}>
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
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h3 className="font-semibold text-gray-900 mb-2">Data to be shared:</h3>
                        <p className="text-sm text-gray-600 mb-4">Select the attributes you want to share with the requester.</p>
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
                                <span className="text-sm text-gray-700">Select all</span>
                            </label>
                        </div>
                        <div className="space-y-3">
                            {scope.map((s) => (
                                <label key={s.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
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
                                        <span className="text-gray-700">{s.label}</span>
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

                    {/* Requester Information */}
                    <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 mb-6">
                        <h4 className="font-medium text-blue-900 mb-2">Shared with:</h4>
                        <div className="flex items-center">
                            <div className="w-8 h-8 bg-teal-700 rounded-full flex items-center justify-center mr-3">
                                <span className="text-white text-xs font-bold">A</span>
                            </div>
                            <div>
                                <p className="font-medium text-blue-900">{requesterName}</p>
                                <p className="text-sm text-blue-700">Trusted verifier</p>
                            </div>
                        </div>
                    </div>

                    {/* Consent Controls */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                        <h3 className="font-semibold text-gray-900 mb-4">Consent</h3>
                        <label className="block text-sm text-gray-700 mb-1">Purpose of data use</label>
                        <input
                            type="text"
                            value={purpose}
                            onChange={(e) => setPurpose(e.target.value)}
                            className="w-full px-3 py-3 bg-gray-100 border border-gray-300 rounded-lg text-black focus:outline-none mb-4"
                            placeholder="Example: service access verification"
                        />
                        <label className="block text-sm text-gray-700 mb-1">Consent duration (days, 0 = no expiration)</label>
                        <input
                            type="number"
                            min={0}
                            value={durationDays}
                            onChange={(e) => setDurationDays(parseInt(e.target.value || '0', 10))}
                            className="w-full px-3 py-3 bg-gray-100 border border-gray-300 rounded-lg text-black focus:outline-none mb-4"
                        />
                        <label className="inline-flex items-center space-x-2">
                            <input
                                type="checkbox"
                                checked={rememberConsent}
                                onChange={(e) => setRememberConsent(e.target.checked)}
                                className="w-4 h-4"
                            />
                            <span className="text-gray-700">Remember this consent for similar requests</span>
                        </label>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    <button
                        onClick={handleConfirm}
                        disabled={isProcessing || selectedScopeIds.length === 0}
                        className={`w-full py-4 rounded-full font-medium text-lg transition-colors ${
                            isProcessing || selectedScopeIds.length === 0
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                        {isProcessing ? 'Sharing...' : 'Agree & Share'}
                    </button>
                    <button
                        onClick={handleCancel}
                        className="w-full text-gray-600 py-4 font-medium text-lg hover:bg-gray-100 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}