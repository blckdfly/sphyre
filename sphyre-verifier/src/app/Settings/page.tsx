'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import HeaderWithBack from '@/components/ui/HeaderWithBack';
import SettingsItem from '@/components/ui/SettingsItem';
import Section from '@/components/ui/Section';

const SettingsPage: React.FC = () => {
    const router = useRouter();
    const [autoHide, setAutoHide] = useState<string>("Off");

    // Function to handle navigation or show a message for pages that don't exist yet
    const handleNavigation = (path: string, title: string) => {
        if (path) {
            router.push(path);
        } else {
            // For pages that don't exist yet, we could show an alert or implement a toast notification
            alert(`${title} page is coming soon!`);
        }
    };

    // Toggle auto-hide setting
    const toggleAutoHide = () => {
        const newValue = autoHide === "Off" ? "On" : "Off";
        setAutoHide(newValue);
    };

    return (
        <div className="min-h-screen bg-black">
            {/* Header */}
            <HeaderWithBack 
                title="Settings" 
                onBackClick={() => router.back()}
            />

            {/* Content */}
            <div className="flex-grow bg-white px-4 pt-6 pb-16">
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

                {/* Advanced Section */}
                <Section title="Advanced">
                    <SettingsItem
                        title="Enable result auto-hide"
                        rightContent={autoHide}
                        onClick={toggleAutoHide}
                    />
                    <SettingsItem
                        title="Result screen display"
                        onClick={() => handleNavigation('/Settings/ResultScreenDisplay', 'Result screen display')}
                    />
                    <SettingsItem
                        title="Preset configuration"
                        onClick={() => handleNavigation('/PresetConfiguration', 'Preset configuration')}
                    />
                </Section>
            </div>

            {/* Version Footer */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
                <div className="px-6 py-4">
                    <p className="text-center text-gray-500 text-sm">
                        Version 1.3.2 (100371)
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;