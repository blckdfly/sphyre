'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronRight, Bell, Shield, FileText, Database, Key, LogOut } from 'lucide-react';

export default function UserProfile() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleNotifications = () => {
        console.log('Notifications clicked');
        router.push('/Notifications');
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

    const handleCachedContexts = () => {
        console.log('Cached Contexts clicked');
        router.push('/CachedContexts');
    };

    const handlePublicDID = () => {
        console.log('Public DID clicked');
        router.push('/PublicDID');
    };

    const handleConsentManagement = () => {
        router.push('/ConsentManagement');
    };

    const handleLogOut = () => {
        console.log('Log Out clicked');
        // Handle logout logic
        const confirmLogout = window.confirm('Are you sure you want to log out?');
        if (confirmLogout) {
            // Implement logout logic here
            router.push('/');
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
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-black text-white px-4 py-6 text-center">
                <h1 className="text-xl font-semibold">User Center</h1>
            </div>

            {/* Profile Section */}
            <div className="bg-white rounded-t-3xl -mt-4 px-6 py-8 shadow-sm">
                <div className="flex items-center space-x-4 mb-8">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-300">
                        <Image
                            src="/assets/profile.JPG"
                            alt="Profile"
                            width={64}
                            height={64}
                            className="object-cover w-full h-full"
                        />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold text-gray-900">blackdoffly</h2>
                    </div>
                </div>

                {/* General Section */}
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">General</h3>
                    <div className="space-y-1">
                        <button
                            onClick={handleNotifications}
                            className="w-full flex items-center justify-between py-4 px-4 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Bell size={20} className="text-gray-600" />
                                <span className="text-gray-900 font-medium">Notifications</span>
                            </div>
                            <ChevronRight size={20} className="text-gray-400" />
                        </button>

                        <button
                            onClick={handleReviewOnboarding}
                            className="w-full flex items-center justify-between py-4 px-4 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Shield size={20} className="text-gray-600" />
                                <span className="text-gray-900 font-medium">Review onboarding</span>
                            </div>
                            <ChevronRight size={20} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Information Section */}
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Information</h3>
                    <div className="space-y-1">
                        <button
                            onClick={handlePrivacyPolicy}
                            className="w-full flex items-center justify-between py-4 px-4 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Shield size={20} className="text-gray-600" />
                                <span className="text-gray-900 font-medium">Privacy Policy</span>
                            </div>
                            <ChevronRight size={20} className="text-gray-400" />
                        </button>

                        <button
                            onClick={handleTermsOfUse}
                            className="w-full flex items-center justify-between py-4 px-4 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <FileText size={20} className="text-gray-600" />
                                <span className="text-gray-900 font-medium">Terms of Use</span>
                            </div>
                            <ChevronRight size={20} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Advanced Section */}
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Advanced</h3>
                    <div className="space-y-1">
                        <button
                            onClick={handleCachedContexts}
                            className="w-full flex items-center justify-between py-4 px-4 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Database size={20} className="text-gray-600" />
                                <span className="text-gray-900 font-medium">Cached Contexts</span>
                            </div>
                            <ChevronRight size={20} className="text-gray-400" />
                        </button>

                        <button
                            onClick={handlePublicDID}
                            className="w-full flex items-center justify-between py-4 px-4 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Key size={20} className="text-gray-600" />
                                <span className="text-gray-900 font-medium">Public DID</span>
                            </div>
                            <ChevronRight size={20} className="text-gray-400" />
                        </button>

                        <button
                            onClick={handleConsentManagement}
                            className="w-full flex items-center justify-between py-4 px-4 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            <div className="flex items-center space-x-3">
                                <Shield size={20} className="text-gray-600" />
                                <span className="text-gray-900 font-medium">Consent Management</span>
                            </div>
                            <ChevronRight size={20} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Account Section */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Account</h3>
                    <button
                        onClick={handleLogOut}
                        className="w-full flex items-center py-4 px-4 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                    >
                        <div className="flex items-center space-x-3">
                            <LogOut size={20} className="text-red-600" />
                            <span className="text-red-600 font-medium">Log Out</span>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
