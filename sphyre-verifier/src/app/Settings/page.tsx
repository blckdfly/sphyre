'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import HeaderWithBack from '@/components/ui/HeaderWithBack';
import SettingsItem from '@/components/ui/SettingsItem';
import Section from '@/components/ui/Section';
import { Building2, Globe, Shield, Copy, Check } from 'lucide-react';
import apiService from '@/services/apiService';

interface VerifierInfo {
    id?: string;
    did?: string;
    name?: string;
    organization?: string;
    domain?: string;
    description?: string;
    website?: string;
    did_doc_cid?: string;
    did_doc_gateway_url?: string;
    blockchain_registered?: boolean;
    blockchain_tx_hash?: string;
}

const SettingsPage: React.FC = () => {
    const router = useRouter();
    const [verifierInfo, setVerifierInfo] = useState<VerifierInfo | null>(null);
    const [copiedDID, setCopiedDID] = useState(false);
    const [copiedCid, setCopiedCid] = useState(false);
    const [copiedTx, setCopiedTx] = useState(false);

    useEffect(() => {
        loadVerifierInfo();
    }, []);

    const loadVerifierInfo = async () => {
        try {
            const verifierDid = localStorage.getItem('verifier_did');

            if (verifierDid) {
                // Fetch from backend
                const response = await apiService.getVerifierInfo(verifierDid);
                if (response.success && response.data) {
                    // Handle both response formats: { verifier: {...} } or direct verifier object
                    const responseData = response.data as Record<string, unknown>;
                    const verifier = (responseData.verifier as VerifierInfo) || (responseData as VerifierInfo);
                    if (verifier && typeof verifier === 'object') {
                        setVerifierInfo(verifier);
                        // Also update localStorage for compatibility
                        localStorage.setItem('verifierInfo', JSON.stringify(verifier));
                    }
                }
            } else {
                // Fallback to localStorage if no DID
                const storedInfo = localStorage.getItem('verifierInfo');
                if (storedInfo) {
                    setVerifierInfo(JSON.parse(storedInfo));
                }
            }
        } catch (error) {
            console.error('Failed to load verifier info:', error);
            // Fallback to localStorage on error
            const storedInfo = localStorage.getItem('verifierInfo');
            if (storedInfo) {
                try {
                    setVerifierInfo(JSON.parse(storedInfo));
                } catch (e) {
                    console.error('Failed to parse verifier info:', e);
                }
            }
        }
    };

    // Function to handle navigation or show a message for pages that don't exist yet
    const handleNavigation = (path: string, title: string) => {
        if (path) {
            router.push(path);
        } else {
            // For pages that don't exist yet, we could show an alert or implement a toast notification
            alert(`${title} page is coming soon!`);
        }
    };

    const normalizeTxHash = (hash?: string | null) => {
        if (!hash) return '';
        return hash.startsWith('0x') ? hash : `0x${hash}`;
    };

    // Copy DID to clipboard
    const ipfsGatewayUrl = verifierInfo?.did_doc_gateway_url || (verifierInfo?.did_doc_cid ? `https://gateway.sphyre.tech/ipfs/${verifierInfo.did_doc_cid}` : undefined);
    const explorerUrl = verifierInfo?.blockchain_tx_hash
        ? `https://sepolia.basescan.org/tx/${normalizeTxHash(verifierInfo.blockchain_tx_hash)}`
        : null;

    const handleCopyDID = () => {
        const did = verifierInfo?.id || verifierInfo?.did || '';
        if (did) {
            navigator.clipboard.writeText(did);
            setCopiedDID(true);
            setTimeout(() => setCopiedDID(false), 2000);
        }
    };

    const handleCopyCid = () => {
        if (!verifierInfo?.did_doc_cid) return;
        navigator.clipboard.writeText(verifierInfo.did_doc_cid);
        setCopiedCid(true);
        setTimeout(() => setCopiedCid(false), 2000);
    };

    const handleCopyTx = () => {
        if (!verifierInfo || !verifierInfo.blockchain_tx_hash) return;
        navigator.clipboard.writeText(normalizeTxHash(verifierInfo.blockchain_tx_hash));
        setCopiedTx(true);
        setTimeout(() => setCopiedTx(false), 2000);
    };

    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* Header */}
            <HeaderWithBack
                title="Settings"
                onBackClick={() => router.back()}
            />

            {/* Content */}
            <div className="flex-1 bg-white px-4 pt-6 pb-16">
                {/* Profile Section */}
                {verifierInfo && (
                    <div className="mb-6 bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl p-6 border border-primary-200">
                        <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0">
                                <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                                    {verifierInfo.name ? verifierInfo.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'V'}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-xl font-bold text-dark-500 mb-1">{verifierInfo.name || 'Verifier'}</h2>
                                {verifierInfo.organization && (
                                    <div className="flex items-center text-sm text-dark-400 mb-2">
                                        <Building2 className="w-4 h-4 mr-1.5" />
                                        <span className="truncate">{verifierInfo.organization}</span>
                                    </div>
                                )}
                                {verifierInfo.domain && (
                                    <div className="flex items-center text-sm text-dark-400 mb-2">
                                        <Globe className="w-4 h-4 mr-1.5" />
                                        <span className="truncate">{verifierInfo.domain}</span>
                                    </div>
                                )}
                                {(verifierInfo.id || verifierInfo.did) && (
                                    <div className="mt-3">
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs font-semibold text-dark-400 flex items-center">
                                                <Shield className="w-3 h-3 mr-1" />
                                                Verifier DID
                                            </label>
                                            <button
                                                onClick={handleCopyDID}
                                                className="flex items-center gap-1 px-2 py-1 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors"
                                            >
                                                {copiedDID ? (
                                                    <>
                                                        <Check className="w-3 h-3" />
                                                        <span>Copied!</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="w-3 h-3" />
                                                        <span>Copy</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        <div className="bg-white/70 rounded-lg p-3 border border-primary-200">
                                            <p className="text-xs font-mono text-dark-500 break-all leading-relaxed">
                                                {verifierInfo.id || verifierInfo.did}
                                            </p>
                                        </div>
                                        <p className="mt-1 text-xs text-dark-300">
                                            Your unique identifier in the Sphyre network
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {verifierInfo?.did_doc_cid && (
                    <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">DID Document (IPFS)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {ipfsGatewayUrl && (
                                    <a
                                        href={ipfsGatewayUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100"
                                    >
                                        View
                                    </a>
                                )}
                                <button
                                    onClick={handleCopyCid}
                                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                                >
                                    {copiedCid ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    {copiedCid ? 'Copied' : 'Copy CID'}
                                </button>
                            </div>
                        </div>
                        <div className="px-4 py-3 bg-gray-50 text-gray-700 rounded-xl border border-gray-200">
                            <p className="text-xs font-mono break-all">{verifierInfo.did_doc_cid}</p>
                        </div>
                    </div>
                )}

                {verifierInfo && verifierInfo.blockchain_registered !== undefined && (
                    <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Blockchain Registration</span>
                            </div>
                            {verifierInfo.blockchain_registered ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-600">
                                    Registered
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-600">
                                    Pending
                                </span>
                            )}
                        </div>
                        {verifierInfo.blockchain_tx_hash ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex-1 min-w-[200px] px-4 py-3 bg-gray-50 text-gray-700 rounded-xl border border-gray-200">
                                    <p className="text-xs font-mono break-all">{verifierInfo.blockchain_tx_hash}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {explorerUrl && (
                                        <a
                                            href={explorerUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100"
                                        >
                                            View TX
                                        </a>
                                    )}
                                    <button
                                        onClick={handleCopyTx}
                                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                                    >
                                        {copiedTx ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                        {copiedTx ? 'Copied' : 'Copy TX'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">
                                No blockchain transaction recorded yet.
                            </p>
                        )}
                    </div>
                )}

                {/* General Section */}
                <Section title="General">
                    <SettingsItem
                        title="Review onboarding"
                        onClick={() => handleNavigation('/Settings/ReviewOnboarding', 'Review onboarding')}
                    />
                    <SettingsItem
                        title="Privacy policy"
                        onClick={() => handleNavigation('/Settings/PrivacyPolicy', 'Privacy policy')}
                    />
                    <SettingsItem
                        title="Terms of use"
                        onClick={() => handleNavigation('/Settings/TermsOfUse', 'Terms of use')}
                    />
                </Section>
            </div>

            {/* Version Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-dark-100">
                <div className="px-6 py-4">
                    <p className="text-center text-dark-300 text-sm">
                        Version 1.3.2 (100371)
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;