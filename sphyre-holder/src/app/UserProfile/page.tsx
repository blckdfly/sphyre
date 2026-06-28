'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Copy, Check, Shield, Key, LogOut, Edit2, ChevronRight, FileText, Lock, ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/contexts/ToastContext';
import walletService from '@/services/walletService';
import ProfileEditModal from '@/components/ui/ProfileEditModal';
import { shortenDID } from '@/lib/didUtils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

type ProfileResponse = {
    username?: string;
    name?: string;
    imageUrl?: string;
    url?: string;
    avatar?: string;
    user?: {
        username?: string;
        name?: string;
        imageUrl?: string;
        avatar?: string;
    };
};

type WalletMetadata = {
    did: string;
    public_key: string;
    did_doc_cid?: string;
    did_doc_gateway_url?: string;
    blockchain_registered?: boolean;
    blockchain_tx_hash?: string;
};

export default function UserProfile() {
    const router = useRouter();
    const { addToast } = useToast();
    const [mounted, setMounted] = useState(false);
    const [profile, setProfile] = useState<{ username?: string; imageUrl?: string } | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [userDID, setUserDID] = useState<string | null>(null);
    const [didCopied, setDidCopied] = useState(false);
    const [showSeedPhrase, setShowSeedPhrase] = useState(false);
    const [seedPhrase, setSeedPhrase] = useState<string | null>(null);
    const [seedCopied, setSeedCopied] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authPIN, setAuthPIN] = useState('');
    const [showAuthDialog, setShowAuthDialog] = useState(false);
    const [showChangePINModal, setShowChangePINModal] = useState(false);
    const [currentPIN, setCurrentPIN] = useState('');
    const [newPIN, setNewPIN] = useState('');
    const [confirmPIN, setConfirmPIN] = useState('');
    const [isChangingPIN, setIsChangingPIN] = useState(false);
    const [syncLoading, setSyncLoading] = useState(false);
    const [walletMetadata, setWalletMetadata] = useState<WalletMetadata | null>(null);
    const [walletMetaLoading, setWalletMetaLoading] = useState(false);
    const [copiedCid, setCopiedCid] = useState(false);
    const [copiedTx, setCopiedTx] = useState(false);

    useEffect(() => {
        setMounted(true);

        // Get current user's DID
        const did = walletService.getCurrentDID();
        if (did) {
            setUserDID(did);
        }

        const fetchProfile = async () => {
            if (!did) return null;

            try {
                const res = await fetch(`${API_BASE}/api/auth/profile`, {
                    method: 'GET',
                    headers: {
                        'X-User-DID': did,
                        'Accept': 'application/json',
                    },
                    credentials: 'omit',
                });
                if (res.ok) {
                    return res.json();
                }
            } catch (error) {
                console.error('Error fetching profile:', error);
            }
            return null;
        };

        (async () => {
            const data = await fetchProfile();
            if (data) {
                const username = data.username || data.name || undefined;
                const imageUrl = data.imageUrl || undefined;
                setProfile({ username, imageUrl });
            }
        })();
    }, []);

    useEffect(() => {
        if (!userDID) {
            setWalletMetadata(null);
            return;
        }

        let cancelled = false;
        const fetchWalletMetadata = async () => {
            try {
                setWalletMetaLoading(true);
                const response = await fetch(`${API_BASE}/api/wallet/${encodeURIComponent(userDID)}`, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        'X-User-DID': userDID,
                    },
                    credentials: 'omit',
                });

                if (!response.ok) {
                    throw new Error('Failed to load wallet metadata');
                }

                const payload = await response.json();
                const wallet = payload.wallet || payload.data?.wallet || payload.data;
                if (!cancelled) {
                    setWalletMetadata(wallet ?? null);
                }
            } catch (error) {
                console.warn('Unable to fetch wallet metadata:', error);
                if (!cancelled) {
                    setWalletMetadata(null);
                }
            } finally {
                if (!cancelled) {
                    setWalletMetaLoading(false);
                }
            }
        };

        fetchWalletMetadata();
        return () => {
            cancelled = true;
        };
    }, [userDID]);

    const handleCopyDID = () => {
        if (userDID) {
            navigator.clipboard.writeText(userDID);
            setDidCopied(true);
            setTimeout(() => setDidCopied(false), 2000);
        }
    };

    const handleCopyCid = () => {
        if (walletMetadata?.did_doc_cid) {
            navigator.clipboard.writeText(walletMetadata.did_doc_cid);
            setCopiedCid(true);
            setTimeout(() => setCopiedCid(false), 2000);
        }
    };

    const handleCopyTx = () => {
        const hash = walletMetadata?.blockchain_tx_hash;
        if (!hash) return;
        const normalized = hash.startsWith('0x') ? hash : `0x${hash}`;
        navigator.clipboard.writeText(normalized);
        setCopiedTx(true);
        setTimeout(() => setCopiedTx(false), 2000);
    };

    const handleGoHome = () => {
        router.push('/SSIWalletIdentity');
    };

    const handleReviewOnboarding = () => {
        console.log('Review onboarding clicked');
        router.push('/ReviewOnboarding');
    };

    const handlePrivacyPolicy = () => {
        console.log('Privacy Policy clicked');
        router.push('/PrivacyPolicy');
    };

    const handleTermsOfUse = () => {
        console.log('Terms of Use clicked');
        router.push('/TermsOfUse');
    };

    const checkSyncStatus = useCallback(async (triggeredByUser = false) => {
        if (syncLoading) {
            return;
        }

        setSyncLoading(true);

        try {
            let localEncryptedSeed =
                typeof window !== 'undefined' ? localStorage.getItem('sphyre_pin_encrypted_seed') : null;

            const status = await walletService.refreshEncryptedSeedStatus();

            if (status?.has_encrypted_seed) {
                if (!localEncryptedSeed) {
                    try {
                        const ensured = await walletService.getEncryptedSeed();
                        if (ensured) {
                            localEncryptedSeed = ensured;
                        }
                    } catch (err) {
                        console.warn('Failed to cache encrypted seed locally after backend sync:', err);
                    }
                }
                return;
            }
        } catch (error) {
            console.error('Failed to check encrypted seed sync status:', error);
            if (triggeredByUser) {
                addToast('Network error while checking PIN backup status.', 'error');
            }
        } finally {
            setSyncLoading(false);
        }
    }, [addToast, syncLoading]);

    const handleShowSeedPhrase = () => {
        setShowAuthDialog(true);
    };

    const handlePINAuth = async () => {
        if (!authPIN || authPIN.length !== 6) {
            addToast('Please enter your 6-digit PIN', 'error');
            return;
        }

        if (!/^\d{6}$/.test(authPIN)) {
            addToast('PIN must be 6 digits', 'error');
            return;
        }

        setIsAuthenticating(true);

        try {
            // Decrypt seed phrase using PIN
            const { decryptData } = await import('@/lib/crypto');
            const encrypted = localStorage.getItem('sphyre_pin_encrypted_seed');

            if (!encrypted) {
                addToast('No encrypted seed phrase found', 'error');
                setIsAuthenticating(false);
                return;
            }

            const recoveredSeedPhrase = decryptData(encrypted, authPIN);

            setSeedPhrase(recoveredSeedPhrase);
            setShowSeedPhrase(true);
            setShowAuthDialog(false);
            setAuthPIN('');
            addToast('Seed phrase decrypted successfully', 'success');
        } catch {
            addToast('Incorrect PIN', 'error');
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleHideSeedPhrase = () => {
        setShowSeedPhrase(false);
        setSeedPhrase(null);
    };

    const handleCopySeedPhrase = () => {
        if (seedPhrase) {
            navigator.clipboard.writeText(seedPhrase)
                .then(() => {
                    setSeedCopied(true);
                    setTimeout(() => setSeedCopied(false), 2000);
                })
                .catch(err => {
                    console.error('Failed to copy seed phrase: ', err);
                });
        }
    };

    const handleSaveProfile = async (username: string, imageFile: File | null) => {
        try {
            if (!userDID) {
                addToast('No DID found. Please log in again.', 'error');
                throw new Error('No DID found');
            }

            console.log('Starting profile update...');
            console.log('Username:', username);
            console.log('Has image:', !!imageFile);
            console.log('User DID:', userDID);

            let newImageUrl: string | undefined = undefined;

            if (imageFile) {
                console.log('Uploading avatar...');
                const fd = new FormData();
                fd.append('avatar', imageFile);

                const avatarRes = await fetch(`${API_BASE}/api/auth/avatar`, {
                    method: 'POST',
                    headers: {
                        'X-User-DID': userDID,
                    },
                    credentials: 'omit',
                    body: fd,
                });

                console.log('  Avatar response status:', avatarRes.status);

                if (!avatarRes.ok) {
                    const errorText = await avatarRes.text();
                    console.error('  Avatar upload failed:', errorText);
                    addToast(`Failed to upload avatar: ${errorText}`, 'error');
                    throw new Error('Failed to upload avatar');
                }

                const avatarData = await avatarRes.json().catch(() => ({} as ProfileResponse));
                newImageUrl = avatarData?.imageUrl || avatarData?.url || avatarData?.avatar || profile?.imageUrl;
                console.log('Avatar uploaded, URL:', newImageUrl ? 'Got URL' : 'No URL');
            }

            console.log('Updating profile info...');
            const profileRes = await fetch(`${API_BASE}/api/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-User-DID': userDID,
                },
                credentials: 'omit',
                body: JSON.stringify({ name: username, username }),
            });

            console.log('  Profile response status:', profileRes.status);

            if (!profileRes.ok) {
                const errorText = await profileRes.text();
                console.error('  Profile update failed:', errorText);
                addToast(`Failed to update profile: ${errorText}`, 'error');
                throw new Error('Failed to update profile');
            }

            const profileData = await profileRes.json().catch(() => ({} as ProfileResponse));
            console.log('  Profile data received:', profileData);

            const updatedProfile = {
                username: profileData.username || profileData.name || username,
                imageUrl: newImageUrl || profileData.imageUrl || profile?.imageUrl,
            };

            setProfile(updatedProfile);
            console.log('Profile state updated:', updatedProfile);

            window.dispatchEvent(new Event('profileUpdated'));
            localStorage.setItem('profile_updated', Date.now().toString());

            addToast('Profile updated successfully!', 'success');
            console.log('Profile update complete!');
        } catch (error) {
            console.error('Error updating profile:', error);
            if (error instanceof Error) {
                addToast(error.message, 'error');
            }
            throw error;
        }
    };

    const handleChangePIN = async () => {
        if (!currentPIN || currentPIN.length < 4) {
            addToast('Current PIN must be at least 6 digits', 'error');
            return;
        }
        if (!newPIN || newPIN.length < 4) {
            addToast('New PIN must be at least 4 digits', 'error');
            return;
        }
        if (newPIN !== confirmPIN) {
            addToast('New PIN and confirmation do not match', 'error');
            return;
        }
        if (currentPIN === newPIN) {
            addToast('New PIN must be different from current PIN', 'error');
            return;
        }

        setIsChangingPIN(true);
        try {
            const { decryptData, encryptData } = await import('@/lib/crypto');
            const encrypted = localStorage.getItem('sphyre_pin_encrypted_seed');

            if (!encrypted) {
                addToast('No encrypted seed phrase found', 'error');
                setIsChangingPIN(false);
                return;
            }

            try {
                decryptData(encrypted, currentPIN);
            } catch {
                addToast('Current PIN is incorrect', 'error');
                setIsChangingPIN(false);
                return;
            }

            const seedPhrase = decryptData(encrypted, currentPIN);
            const newEncrypted = encryptData(seedPhrase, newPIN);
            localStorage.setItem('sphyre_pin_encrypted_seed', newEncrypted);

            if (userDID) {
                try {
                    await fetch(`${API_BASE}/api/wallet/${userDID}/pin/change`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-User-DID': userDID,
                        },
                        credentials: 'omit',
                        body: JSON.stringify({
                            current_pin: currentPIN,
                            new_pin: newPIN,
                        }),
                    });
                } catch (error) {
                    console.warn('Backend PIN change error:', error);
                }
            }

            addToast('PIN changed successfully!', 'success');
            setShowChangePINModal(false);
            setCurrentPIN('');
            setNewPIN('');
            setConfirmPIN('');
        } catch (error) {
            console.error('Error changing PIN:', error);
            addToast('Failed to change PIN', 'error');
        } finally {
            setIsChangingPIN(false);
        }
    };

    const handleLogOut = () => {
        const confirmLogout = window.confirm('Are you sure you want to log out? You will need to enter your seed phrase to access your wallet again.');
        if (confirmLogout) {
            walletService.logout();

            if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
            }

            router.push('/onboarding');
        }
    };

    useEffect(() => {
        if (!mounted) {
            return;
        }

        checkSyncStatus();
    }, [mounted, checkSyncStatus]);

    useEffect(() => {
        if (!mounted) return;
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/health`, { credentials: 'omit' });
                if (res.ok) {
                    const j = await res.json().catch(() => null);
                    console.log('API health OK:', j || 'ok');
                } else {
                    console.warn('API health not OK:', res.status);
                }
            } catch { }
        })();
    }, [mounted]);

    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-screen bg-light-50">
                <p className="text-dark-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-light-50">
            {/* Header */}
            <div className="bg-black text-white px-6 pt-12 pb-16 rounded-b-3xl">
                <div className="flex items-center justify-between">
                    <button
                        onClick={handleGoHome}
                        className="p-2"
                        aria-label="Back to wallet"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-semibold">User Center</h1>
                    <div className="w-10 h-10" />
                </div>
            </div>

            {/* Profile Section */}
            <div className="bg-light-50 rounded-t-3xl -mt-10 px-6 py-8 shadow-sm">
                <div className="flex items-center space-x-4 mb-8">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-300">
                        <Image
                            src={profile?.imageUrl || '/assets/profile.JPG'}
                            alt="Profile"
                            width={64}
                            height={64}
                            className="object-cover w-full h-full"
                        />
                    </div>
                    <div className="flex-1">
                        <div className="mb-1">
                            <span className="inline-block px-3 py-1 text-black text-base font-semibold">
                                {profile?.username}
                            </span>
                        </div>
                        {userDID && (
                            <div className="bg-gray-50 rounded-lg p-3 mx-3">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs text-dark-300 font-semibold">Your DID</p>
                                    <button
                                        onClick={handleCopyDID}
                                        className="p-1.5 hover:bg-gray-200 rounded-lg transition flex items-center gap-1"
                                    >
                                        {didCopied ? (
                                            <>
                                                <Copy size={14} className="text-gray-500" />
                                                <span className="text-xs text-green-600">Copied</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy size={14} className="text-gray-500" />
                                            </>
                                        )}
                                    </button>
                                </div>
                                <p className="text-xs text-dark-500 font-mono break-all">
                                    {shortenDID(userDID, 8, 8)}
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setShowEditModal(true)}
                        className="p-2 rounded-full hover:bg-light-200 transition-colors"
                    >
                        <Edit2 size={20} className="text-dark-300" />
                    </button>
                </div>

                {walletMetadata && (
                    <div className="mb-8 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-dark-500">DID Document & Blockchain</h3>
                            {walletMetaLoading && (
                                <span className="text-xs text-dark-300">Syncing…</span>
                            )}
                        </div>

                        {walletMetadata.did_doc_cid && (
                            <div className="bg-white rounded-2xl border border-dark-100/70 p-4 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2 text-dark-400 text-xs font-semibold uppercase tracking-wide">
                                        DID Document (IPFS)
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            const gatewayUrl = walletMetadata.did_doc_gateway_url ||
                                                (walletMetadata.did_doc_cid
                                                    ? `https://gateway.sphyre.tech/ipfs/${walletMetadata.did_doc_cid}`
                                                    : null);
                                            return gatewayUrl ? (
                                                <a
                                                    href={gatewayUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100"
                                                >
                                                    View
                                                </a>
                                            ) : null;
                                        })()}
                                        <button
                                            onClick={handleCopyCid}
                                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                                        >
                                            {copiedCid ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                            {copiedCid ? 'Copied' : 'Copy CID'}
                                        </button>
                                    </div>
                                </div>
                                <div className="px-4 py-3 bg-light-100 rounded-xl border border-dark-100/70 text-xs font-mono text-dark-500 break-all">
                                    {walletMetadata.did_doc_cid}
                                </div>
                            </div>
                        )}

                        {walletMetadata.blockchain_registered !== undefined && (
                            <div className="bg-white rounded-2xl border border-dark-100/70 p-4 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2 text-dark-400 text-xs font-semibold uppercase tracking-wide">
                                        Blockchain Registration
                                    </div>
                                    {walletMetadata.blockchain_registered ? (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-600">
                                            Registered
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-600">
                                            Pending
                                        </span>
                                    )}
                                </div>

                                {walletMetadata.blockchain_tx_hash ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex-1 min-w-[200px] px-4 py-3 bg-light-100 rounded-xl border border-dark-100/70 text-xs font-mono text-dark-500 break-all">
                                            {walletMetadata.blockchain_tx_hash.startsWith('0x')
                                                ? walletMetadata.blockchain_tx_hash
                                                : `0x${walletMetadata.blockchain_tx_hash}`}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                const normalizedHash = walletMetadata.blockchain_tx_hash
                                                    ? (walletMetadata.blockchain_tx_hash.startsWith('0x')
                                                        ? walletMetadata.blockchain_tx_hash
                                                        : `0x${walletMetadata.blockchain_tx_hash}`)
                                                    : null;
                                                return normalizedHash ? (
                                                    <a
                                                        href={`https://sepolia.basescan.org/tx/${normalizedHash}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100"
                                                    >
                                                        View TX
                                                    </a>
                                                ) : null;
                                            })()}
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
                                    <p className="text-sm text-dark-300">No blockchain transaction recorded yet.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Information Section */}
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-dark-500 mb-4">Information</h3>
                    <div className="space-y-1">
                        <button
                            onClick={handleReviewOnboarding}
                            className="w-full flex items-center justify-between py-4 px-4 bg-light-75 rounded-xl transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Shield size={20} className="text-dark-300" />
                                <span className="text-dark-500 font-medium">Review onboarding</span>
                            </div>
                            <ChevronRight size={20} className="text-dark-200" />
                        </button>

                        <button
                            onClick={handlePrivacyPolicy}
                            className="w-full flex items-center justify-between py-4 px-4 bg-light-75 rounded-xl transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Shield size={20} className="text-dark-300" />
                                <span className="text-dark-500 font-medium">Privacy Policy</span>
                            </div>
                            <ChevronRight size={20} className="text-dark-200" />
                        </button>

                        <button
                            onClick={handleTermsOfUse}
                            className="w-full flex items-center justify-between py-4 px-4 bg-light-75 rounded-xl transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <FileText size={20} className="text-dark-300" />
                                <span className="text-dark-500 font-medium">Terms of Use</span>
                            </div>
                            <ChevronRight size={20} className="text-dark-200" />
                        </button>
                    </div>
                </div>

                {/* Advanced Section */}
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-dark-500 mb-4">Advanced</h3>
                    <div className="space-y-1">
                        <button
                            onClick={handleShowSeedPhrase}
                            className="w-full flex items-center justify-between py-4 px-4 bg-light-75 rounded-xl transition-colors"
                            disabled={isAuthenticating}
                        >
                            <div className="flex items-center space-x-3">
                                <Lock size={20} className="text-dark-300" />
                                <span className="text-dark-500 font-medium">
                                    {showSeedPhrase ? 'Hide Seed Phrase' : 'Show Seed Phrase'}
                                </span>
                            </div>
                            {isAuthenticating ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                            ) : (
                                <ChevronRight size={20} className="text-dark-200" />
                            )}
                        </button>

                        <button
                            onClick={() => setShowChangePINModal(true)}
                            className="w-full flex items-center justify-between py-4 px-4 bg-light-75 rounded-xl transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Key size={20} className="text-dark-300" />
                                <span className="text-dark-500 font-medium">Change PIN</span>
                            </div>
                            <ChevronRight size={20} className="text-dark-200" />
                        </button>
                    </div>
                </div>

                {/* Account Section */}
                <div>
                    <h3 className="text-lg font-semibold text-dark-500 mb-4">Account</h3>
                    <button
                        onClick={handleLogOut}
                        className="w-full flex items-center py-4 px-4 bg-dark-100 rounded-xl hover:bg-red-100 transition-colors"
                    >
                        <div className="flex items-center space-x-3">
                            <LogOut size={20} className="text-red-600" />
                            <span className="text-red-600 font-medium">Log Out</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Seed Phrase Display */}
            {showSeedPhrase && seedPhrase && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full">
                        <div className="flex items-start justify-between mb-4">
                            <h3 className="text-lg font-semibold leading-snug">Recovery Seed Phrase</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopySeedPhrase}
                                    className="flex items-center gap-2 bg-primary-500 text-white px-3 py-1.5 rounded-lg"
                                >
                                    {seedCopied ? <Check size={16} /> : <Copy size={16} />}
                                    <span className="text-sm font-medium">{seedCopied ? 'Copied!' : 'Copy'}</span>
                                </button>
                                <button
                                    onClick={handleHideSeedPhrase}
                                    className="p-2 rounded-full bg-light-200 hover:bg-light-300 transition-colors"
                                    aria-label="Close seed phrase"
                                >
                                    <X size={18} className="text-dark-300" />
                                </button>
                            </div>
                        </div>
                        <div className="bg-light-200 rounded-lg p-4 mb-4">
                            <div className="grid grid-cols-3 gap-2">
                                {seedPhrase.split(' ').map((word, index) => (
                                    <div key={index} className="bg-white rounded px-2 py-1 text-sm text-center">
                                        <span className="text-dark-300 text-xs">{index + 1}.</span> {word}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* PIN Authentication Dialog */}
            {showAuthDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
                        <h3 className="text-lg font-semibold mb-4">Enter PIN to View Seed Phrase</h3>
                        <p className="text-sm text-dark-300 mb-4">
                            Enter your 6-digit PIN to decrypt and view the seed phrase
                        </p>
                        <input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={authPIN}
                            onChange={(e) => setAuthPIN(e.target.value.replace(/\D/g, ''))}
                            className="w-full px-3 py-2 border border-dark-100 rounded-lg mb-4 text-center text-lg tracking-widest"
                            placeholder="• • • • • •"
                        />
                        <div className="flex space-x-2">
                            <button
                                onClick={() => {
                                    setShowAuthDialog(false);
                                    setAuthPIN('');
                                }}
                                className="flex-1 bg-gray-300 text-dark-500 py-2 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePINAuth}
                                disabled={authPIN.length !== 6}
                                className="flex-1 bg-primary-800 text-white py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Unlock
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showChangePINModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
                        <h3 className="text-lg font-semibold mb-4">Change PIN</h3>
                        <p className="text-sm text-dark-300 mb-6">
                            Enter your current PIN and choose a new PIN
                        </p>

                        <div className="mb-4">
                            <label className="text-sm font-medium text-dark-500 mb-2 block">Current PIN</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                value={currentPIN}
                                onChange={(e) => setCurrentPIN(e.target.value.replace(/\D/g, ''))}
                                className="w-full px-3 py-2 border border-dark-100 rounded-lg text-center text-lg tracking-widest"
                                placeholder="• • • • • •"
                                disabled={isChangingPIN}
                            />
                        </div>

                        <div className="mb-4">
                            <label className="text-sm font-medium text-dark-500 mb-2 block">New PIN</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                value={newPIN}
                                onChange={(e) => setNewPIN(e.target.value.replace(/\D/g, ''))}
                                className="w-full px-3 py-2 border border-dark-100 rounded-lg text-center text-lg tracking-widest"
                                placeholder="• • • • • •"
                                disabled={isChangingPIN}
                            />
                        </div>

                        <div className="mb-6">
                            <label className="text-sm font-medium text-dark-500 mb-2 block">Confirm New PIN</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                value={confirmPIN}
                                onChange={(e) => setConfirmPIN(e.target.value.replace(/\D/g, ''))}
                                className="w-full px-3 py-2 border border-dark-100 rounded-lg text-center text-lg tracking-widest"
                                placeholder="• • • • • •"
                                disabled={isChangingPIN}
                            />
                        </div>

                        <div className="flex space-x-2">
                            <button
                                onClick={() => {
                                    setShowChangePINModal(false);
                                    setCurrentPIN('');
                                    setNewPIN('');
                                    setConfirmPIN('');
                                }}
                                disabled={isChangingPIN}
                                className="flex-1 bg-gray-300 text-dark-500 py-2 rounded-lg disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleChangePIN}
                                disabled={currentPIN.length < 4 || newPIN.length < 4 || confirmPIN.length < 4 || isChangingPIN}
                                className="flex-1 bg-primary-800 text-white py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                {isChangingPIN ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                        Changing...
                                    </>
                                ) : (
                                    'Change PIN'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Edit Modal */}
            <ProfileEditModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                currentUsername={profile?.username}
                currentImageUrl={profile?.imageUrl}
                onSave={handleSaveProfile}
            />
        </div>
    );
}
