'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProfileBar from '@/components/ui/ProfileBar';
import { useProfile } from '@/hooks/useProfile';
import { Plus, CreditCard, Shield } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import walletService from '@/services/walletService';
import apiService from '@/services/apiService';
import IdentityCard from '@/components/ui/IdentityCard';
import BottomNav from '@/components/ui/BottomNav';
import ScanActionPopup from '@/components/ui/ScanActionPopup';
import CredentialDetailModal from '@/components/ui/CredentialDetailModal';
import LoadingScreen from '@/components/ui/LoadingScreen';
import activityService, { Activity } from '@/services/activityService';

interface CredentialDetail {
    id: string;
    title: string;
    issuer: string;
    issuerDid?: string;
    bgColor?: string;
    issuedDate: string;
    expiryDate?: string;
    attributes: { name: string; value: string }[];
    ipfsHash?: string;
    ipfsGatewayUrl?: string;
    blockchainTxHash?: string;
    signatureType?: string;
    bbsSignature?: string;
}

export default function SSIWalletIdentityPage() {
    const router = useRouter();
    const { addToast } = useToast();
    const { profile } = useProfile();
    const [mounted, setMounted] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [showScanPopup, setShowScanPopup] = useState(false);
    const [selectedCredential, setSelectedCredential] = useState<CredentialDetail | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [allCredentials, setAllCredentials] = useState<CredentialDetail[]>([]);
    const [displayedCardIds, setDisplayedCardIds] = useState<string[]>([]);
    const [pendingAccessRequest, setPendingAccessRequest] = useState<Activity | null>(null);
    const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null);

    const ACCESS_BANNER_STORAGE_KEY = 'ssi_wallet_access_banner:dismissed_request_id';

    const identityCards = displayedCardIds
        .map(id => {
            const cred = allCredentials.find(c => c.id === id);
            if (!cred) return null;
            return {
                title: cred.title,
                issuer: cred.issuer,
                issuedDate: cred.issuedDate,
                bgColor: cred.bgColor,
                onClick: () => {
                    setSelectedCredential(cred);
                    setShowDetailModal(true);
                },
                signatureType: cred.signatureType,
                bbsSignature: cred.bbsSignature,
            };
        })
        .filter(Boolean);

    const fetchCredentialFromIPFS = async (ipfsGatewayUrl: string) => {
        try {
            const response = await fetch(ipfsGatewayUrl, {
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) {
                throw new Error(`IPFS fetch failed: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching from IPFS:', error);
            return null;
        }
    };

    const isRecord = (value: unknown): value is Record<string, unknown> => {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    };

    const getString = (value: unknown, fallback = ''): string => {
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        return fallback;
    };

    const formatDateValue = (value: unknown): string | undefined => {
        if (value === undefined || value === null) return undefined;

        if (value instanceof Date) {
            return isNaN(value.getTime()) ? undefined : value.toLocaleDateString();
        }

        if (typeof value === 'string' || typeof value === 'number') {
            const date = new Date(value);
            return isNaN(date.getTime()) ? undefined : date.toLocaleDateString();
        }

        return undefined;
    };

    const unwrapCredentialArray = (payload: unknown): Record<string, unknown>[] => {
        if (Array.isArray(payload)) {
            return payload as Record<string, unknown>[];
        }

        if (payload && typeof payload === 'object') {
            const candidate = payload as Record<string, unknown>;
            for (const key of ['data', 'credentials', 'items']) {
                const value = candidate[key];
                if (Array.isArray(value)) {
                    return value as Record<string, unknown>[];
                }
            }
        }

        return [];
    };

    const fetchCredentials = useCallback(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 5000);

        try {
            if (!walletService.isSessionAuthenticated()) {
                addToast('Please login with your seed phrase first', 'error');
                if (walletService.isInitialized()) {
                    router.push('/recovery'); 
                } else {
                    router.push('/onboarding');
                }
                return;
            }
            
            const did = walletService.getCurrentDID();
            if (!did) {
                addToast('Please set up your wallet first', 'error');
                router.push('/onboarding');
                return;
            }

            const response = await Promise.race([
                apiService.getCredentials(did),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Request timeout')), 5000)
                )
            ]);
            
            const rawCredentials = unwrapCredentialArray(response?.data);

            if (response?.success && rawCredentials.length > 0) {
                const typedCredentials = rawCredentials.filter(isRecord);

                const formattedCredentials = await Promise.all(
                    typedCredentials.map(async (cred, index) => {
                        let attributes: { name: string; value: string; }[] = [];
 
                        const ipfsUrl = cred?.ipfs_gateway_url || cred?.ipfs_url;
                        if (ipfsUrl) {
                            const fullCredential = await fetchCredentialFromIPFS(ipfsUrl as string);
                            if (fullCredential?.credentialSubject?.claims) {
                                attributes = Object.entries(fullCredential.credentialSubject.claims).map(([key, value]) => ({
                                    name: key,
                                    value: value?.toString() || '',
                                }));
                            }
                        }
                       
                        const previewSource = cred?.credential_preview || cred?.credential_data || cred?.preview;
                        if (attributes.length === 0 && isRecord(previewSource)) {
                            attributes = Object.entries(previewSource).map(([key, value]) => ({
                                name: key,
                                value: value?.toString() || '',
                            }));
                        }
                        
                        const issuerDid = getString(cred.issuer_did);
                        const issuerName = getString(cred.issuer_name || issuerDid || cred.issuer, 'Unknown Issuer');
                        const credentialType = getString(cred.credential_type || cred.type, 'Credential');
                        const issuanceDate =
                            formatDateValue(
                                cred.issuance_date ||
                                    cred.created_at ||
                                    cred.issued_at ||
                                    cred.createdAt ||
                                    cred.issuedDate
                            ) || 'N/A';
                        const expiryDate = formatDateValue(cred.expiration_date);
                        const credentialId = getString(cred.id || cred.credential_id || cred._id, `credential-${index}`);

                        return {
                            id: credentialId,
                            title: credentialType,
                            issuer: issuerName,
                            issuerDid,
                            bgColor: getColorForType(credentialType),
                            issuedDate: issuanceDate,
                            expiryDate,
                            attributes,
                            ipfsHash: getString(cred.ipfs_hash),
                            ipfsGatewayUrl: getString(cred.ipfs_gateway_url || cred.ipfs_url),
                            blockchainTxHash: getString(cred.blockchain_tx_hash),
                            signatureType: getString(cred.signature_type),
                            bbsSignature: getString(cred.bbs_signature),
                        };
                    })
                );
                setAllCredentials(formattedCredentials)
                const top3Ids = formattedCredentials
                    .slice(0, 3)
                    .map(c => c.id)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0);
                setDisplayedCardIds(top3Ids);
            } else {
                setAllCredentials([]);
                setDisplayedCardIds([]);
            }
        } catch (error) {
            console.error('Error fetching credentials:', error);
            if (error.message === 'Request timeout' || error.name === 'AbortError') {
                console.log('Backend API timeout - using sample data');
            } else {
                addToast('Using offline mode with sample credentials', 'info');
            }
            setAllCredentials([]);
            setDisplayedCardIds([]);
        } finally {
            clearTimeout(timeoutId);
            setInitialLoading(false);
        }
      }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

    const getColorForType = (type: string): string => {
        const colors: { [key: string]: string } = {
            NationalID: 'linear-gradient(140deg, #000266 0%, #3337FF 52%, #6668FF 100%)',
            EmployeeBadge: 'linear-gradient(140deg, #000266 0%, #0005FF 45%, #6668FF 100%)',
            StudentID: 'linear-gradient(140deg, #000266 0%, #3337FF 50%, #999AFF 100%)',
            DriverLicense: 'linear-gradient(140deg, #000266 0%, #3337FF 40%, #CCCDFF 100%)',
            Passport: 'linear-gradient(140deg, #000266 0%, #3337FF 45%, #6668FF 100%)',
            HealthCertificate: 'linear-gradient(140deg, #000266 0%, #0005FF 52%, #3337FF 100%)'
        };
        return colors[type] || 'linear-gradient(140deg, #000266 0%, #3337FF 52%, #6668FF 100%)';
    };


    useEffect(() => {
        setMounted(true);
        const verificationFailure = sessionStorage.getItem('verification_failure');
        const verificationSuccess = sessionStorage.getItem('verification_success');
        
        if (verificationFailure) {
            console.log('Verification failure detected, redirecting...');
            router.push('/VerificationFailure');
            return;
        }
        
        if (verificationSuccess) {
            console.log('erification success detected, redirecting...');
            router.push('/VerificationSuccess');
            return;
        }

        const checkAuth = async () => {
            if (!walletService.isSessionAuthenticated()) {
                if (walletService.isInitialized()) {
                    router.push('/recovery');
                } else {
                    router.push('/onboarding');
                }
            } else {
                await fetchCredentials();
            }
        };
        
        checkAuth();
    }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleIdentityClick = () => {
        console.log('Identity selected');
    };

    const handleActivityClick = () => {
        router.push('/SSIWalletActivity');
    };

    const handleAddNewData = () => {
        console.log('Navigate to credential request flow');
        router.push('/RequestCredential');
    };

    const handleViewAllCredentials = () => {
        console.log('Navigate to all credentials page');
        router.push('/MyCredentials');
    };

    const handleRequestCollect = () => {
        setShowScanPopup(false);
        router.push('/QRScanner');
    };

    const handleShareInPerson = () => {
        setShowScanPopup(false);
        router.push('/ShareCredentials');
    };

    useEffect(() => {
        if (!mounted || typeof window === 'undefined') {
            return;
        }

        const storedDismissedId = localStorage.getItem(ACCESS_BANNER_STORAGE_KEY);
        if (storedDismissedId) {
            setDismissedRequestId(storedDismissedId);
        }

        const did = walletService.getCurrentDID();
        if (!did) {
            return;
        }

        let cancelled = false;

        const syncActivities = async (force = false) => {
            try {
                const result = await activityService.loadActivities(did, { force });
                if (cancelled) {
                    return;
                }

                const latestAccessRequest = result.activities.find(
                    activity => activity.type === 'access_requested' && activity.status === 'pending'
                ) || null;

                setPendingAccessRequest(latestAccessRequest);
            } catch (error) {
                if (!cancelled) {
                    console.warn('Failed to sync wallet activities:', error);
                }
            }
        };

        syncActivities(true);
        const interval = setInterval(() => syncActivities(true), 5000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [mounted]);

    const handleReviewAccessRequest = () => {
        router.push('/SSIWalletActivity');
    };

    const handleDismissAccessBanner = () => {
        if (!pendingAccessRequest) return;
        setDismissedRequestId(pendingAccessRequest.id);
        if (typeof window !== 'undefined') {
            localStorage.setItem(ACCESS_BANNER_STORAGE_KEY, pendingAccessRequest.id);
        }
    };

    const isBannerDismissed = pendingAccessRequest && dismissedRequestId === pendingAccessRequest.id;
    const accessBannerVisible = Boolean(pendingAccessRequest && !isBannerDismissed);
    const accessMetadata = pendingAccessRequest?.metadata || {};
    const accessVerifier = accessMetadata.verifier_name || accessMetadata.verifierName || 'Verifier';
    const accessPurpose = accessMetadata.purpose || pendingAccessRequest?.description;
    const accessExpiresAt = accessMetadata.expires_at || accessMetadata.expiresAt;

    if (!mounted || initialLoading) {
        return <LoadingScreen message="Syncing Credentials" subMessage="Connecting to Sphyre Network" />;
    }

    return (
        <>
            <div className="flex flex-col h-screen bg-black">
                {/* Header with Profile */}
                <div className="bg-black px-4 py-4">
                    <ProfileBar username={profile?.username} />
                </div>

                <div className="flex-grow bg-white rounded-t-3xl px-4 pt-10 pb-24 overflow-y-auto">
                    {accessBannerVisible && (
                        <div className="mb-5">
                            <div className="w-full rounded-xl border border-primary-100 bg-primary-50/70 px-4 py-3 shadow-sm">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center">
                                            <Shield size={18} className="text-primary-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Access request</p>
                                            <p className="text-sm font-semibold text-dark-600 truncate">
                                                {pendingAccessRequest?.title || `Access request from ${accessVerifier}`}
                                            </p>
                                            <p className="text-xs text-dark-400 truncate">
                                                {accessPurpose || 'A verifier wants to review your credential again.'}
                                            </p>
                                            {accessExpiresAt && (
                                                <p className="mt-1 text-[11px] text-dark-300">
                                                    Valid until {new Date(accessExpiresAt).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 sm:justify-end">
                                        <button
                                            onClick={handleReviewAccessRequest}
                                            className="inline-flex items-center justify-center rounded-lg bg-primary-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-600"
                                        >
                                            Review
                                        </button>
                                        <button
                                            onClick={handleDismissAccessBanner}
                                            className="text-xs font-medium text-primary-600 hover:text-primary-700"
                                        >
                                            Maybe later
                                        </button>
                                        <button
                                            onClick={handleDismissAccessBanner}
                                            className="p-1 rounded-full text-primary-300 hover:text-primary-600"
                                            aria-label="Dismiss access request banner"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {displayedCardIds.length > 0 && (
                        <div className="mb-8">
                            <IdentityCard cards={identityCards} />
                        </div>
                    )}

                    <div className="space-y-4">
                        <button
                            onClick={handleViewAllCredentials}
                            className="w-full bg-white border border-dark-100 rounded-xl p-4 flex items-center justify-between"
                        >
                            <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 bg-light-75 rounded-lg flex items-center justify-center">
                                    <CreditCard size={20} className="text-dark-300" />
                                </div>
                                <div className="text-left">
                                    <p className="font-medium text-dark-500">My Credentials</p>
                                    <p className="text-sm text-dark-300">Access your verified data here</p>
                                </div>
                            </div>
                            <div className="text-dark-200">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>
                        <div
                            className="w-full bg-white border border-dark-100 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-light-100 transition-colors shadow-sm"
                            onClick={handleAddNewData}
                        >
                            <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 bg-light-75 rounded-xl flex items-center justify-center">
                                    <Plus size={20} className="text-dark-300" />
                                </div>
                                <div>
                                    <p className="font-medium text-dark-500">Add new data</p>
                                    <p className="text-sm text-dark-300">
                                        Which type of data you&apos;d like
                                    </p>
                                </div>
                            </div>
                            <div className="text-dark-200">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </div>

                        <div className="w-full bg-white border border-dark-100 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-light-100 transition-colors shadow-sm" onClick={() => router.push('/ConsentManagement')}>
                            <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 bg-light-75 rounded-xl flex items-center justify-center">
                                    <Shield size={20} className="text-dark-300" />
                                </div>
                                <div>
                                    <p className="font-medium text-dark-500">Consent Management</p>
                                    <p className="text-sm text-dark-300">Review and revoke shared attributes</p>
                                </div>
                            </div>
                            <div className="text-dark-200">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="fixed bottom-0 left-0 right-0 z-10">
                    <BottomNav
                        onAddClick={handleIdentityClick}
                        onScanToggle={() => setShowScanPopup(true)}
                        onActivityClick={handleActivityClick}
                        activeTab="identity"
                    />
                </div>
            </div>

            <ScanActionPopup
                visible={showScanPopup}
                onClose={() => setShowScanPopup(false)}
                onRequestCollect={handleRequestCollect}
                onShareInPerson={handleShareInPerson}
            />

            <CredentialDetailModal
                isOpen={showDetailModal}
                onClose={() => setShowDetailModal(false)}
                credential={selectedCredential}
            />
        </>
    );
}
