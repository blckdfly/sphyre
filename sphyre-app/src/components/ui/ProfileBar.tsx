'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Bell } from 'lucide-react';

interface ProfileBarProps {
    username: string;
}

const ProfileBar: React.FC<ProfileBarProps> = ({ username }) => {
    const router = useRouter();

    const handleProfileClick = () => {
        router.push('/UserProfile');
    };

    const handleNotificationClick = () => {
        console.log('Notifications clicked');
        router.push('/NotificationsBar');
    };

    return (
        <div className="bg-black px-4 pt-6 pb-4 flex items-center justify-between">
            <button
                onClick={handleProfileClick}
                className="flex items-center rounded-lg p-2 -m-2 transition-colors"
            >
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-300 mr-3">
                    <Image
                        src="/assets/profile.JPG"
                        alt="Profile"
                        width={40}
                        height={40}
                        className="object-cover"
                    />
                </div>
                <span className="text-white font-medium">@{username}</span>
            </button>
            <button
                onClick={handleNotificationClick}
                className="text-white hover:bg-gray-800 p-2 rounded-lg transition-colors"
            >
                <Bell size={24} />
            </button>
        </div>
    );
};

export default ProfileBar;
