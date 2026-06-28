'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import walletService from '@/services/walletService';
import { shortenDID } from '@/lib/didUtils';
import { useProfile } from '@/hooks/useProfile';

interface ProfileBarProps {
    username?: string;
    onProfileUpdate?: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

const ProfileBar: React.FC<ProfileBarProps> = ({ username: defaultUsername, onProfileUpdate }) => {
    const router = useRouter();
    const { profile: localProfile } = useProfile();
    const [profile, setProfile] = useState<{ username?: string; imageUrl?: string } | null>(null);
    const [userDID, setUserDID] = useState<string | null>(null);

    const fetchProfile = async () => {
        try {
            const userDID = walletService.getCurrentDID();
            if (!userDID) {
                console.log('No DID found, skipping profile fetch');
                return;
            }

            const res = await fetch(`${API_BASE}/api/auth/profile`, {
                method: 'GET',
                headers: {
                    'X-User-DID': userDID,
                    'Accept': 'application/json',
                },
                credentials: 'omit',
            });
            if (res.ok) {
                const data = await res.json();
                const username = data?.username || data?.name || data?.user?.username;
                const imageUrl = data?.imageUrl || data?.avatar || data?.user?.imageUrl;

                setProfile({ username, imageUrl });
                if (onProfileUpdate) {
                    onProfileUpdate();
                }
            } else {
                console.log('Profile fetch failed:', res.status, '- using defaults');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log('Profile fetch error (expected if endpoint not available):', message);
        }
    };

    useEffect(() => {
        fetchProfile();
        
        // Get user DID
        const did = walletService.getCurrentDID();
        setUserDID(did);

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'profile_updated') {
                fetchProfile();
            }
        };
        
        window.addEventListener('storage', handleStorageChange);
        
        // Also check for custom event
        const handleProfileUpdate = () => fetchProfile();
        window.addEventListener('profileUpdated', handleProfileUpdate);
        
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('profileUpdated', handleProfileUpdate);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleProfileClick = () => {
        router.push('/UserProfile');
    };

    const displayUsername = profile?.username || localProfile?.username || defaultUsername || 'User';
    const displayImageUrl = profile?.imageUrl || localProfile?.imageUrl || '/assets/profile.JPG';
    const isBase64Image = typeof displayImageUrl === 'string' && displayImageUrl.startsWith('data:');

    return (
        <div className="bg-black px-4 pt-6 pb-4">
            <div className="flex items-center justify-between">
                <button
                    onClick={handleProfileClick}
                    className="flex items-center rounded-lg p-2 -m-2 transition-colors"
                >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 mr-3">
                        <Image
                            src={displayImageUrl}
                            alt="Profile"
                            width={40}
                            height={40}
                            className="object-cover"
                            unoptimized={isBase64Image}
                        />
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="text-white font-medium">{displayUsername}</span>
                        {userDID && (
                            <span className="text-gray-400 text-xs font-mono">
                                {shortenDID(userDID, 4, 4)}
                            </span>
                        )}
                    </div>
                </button>
            </div>
        </div>
    );
};

export default ProfileBar;
