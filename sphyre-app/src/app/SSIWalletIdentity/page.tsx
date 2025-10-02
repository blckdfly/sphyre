'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import dynamic from 'next/dynamic';

// Import component
import ProfileBar from '@/components/ui/ProfileBar';
import ScanActionPopup from '@/components/ui/ScanActionPopup';
import ScanActionPortal from '@/components/ui/ScanActionPortal';
import IdentityCard from '@/components/ui/IdentityCard';

const BottomNav = dynamic(() => import('@/components/ui/BottomNav'), {
    ssr: false,
});

export default function SSIWalletIdentity() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [showScanPopup, setShowScanPopup] = useState(false);

    // Sample identity cards data
    const identityCards = [
        {
            title: "Lumera Employee Badge",
            issuer: "Lumera Labs",
            bgColor: "#0D2B6B",
            onClick: () => console.log("Card 1 clicked")
        },
        {
            title: "National ID Card",
            issuer: "Government of Indonesia",
            bgColor: "#1A5276",
            onClick: () => console.log("Card 2 clicked")
        },
        {
            title: "University Student ID",
            issuer: "Jakarta University",
            bgColor: "#154360",
            onClick: () => console.log("Card 3 clicked")
        }
    ];

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleIdentityClick = () => {
        console.log('Identity selected');
    };

    const handleActivityClick = () => {
        router.push('/SSIWalletActivity');
    };

    const handleAddNewData = () => {
        router.push('/IdentityVerification');
    };

    const handleRequestCollect = () => {
        setShowScanPopup(false);
        console.log('Respond or Collect clicked');
    };

    const handleShareInPerson = () => {
        setShowScanPopup(false);
        router.push('/ShareCredentials');
    };

    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-screen bg-black">
                <p className="text-white">Loading...</p>
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-col h-screen bg-black">
                {/* Header with Profile */}
                <div className="bg-black px-4 py-6">
                    <ProfileBar username="blackdoffly" />
                </div>

                <div className="flex-grow bg-white rounded-t-3xl px-4 pt-8 pb-24 overflow-y-auto">
                    {/* Identity Cards in stacked format */}
                    <IdentityCard cards={identityCards} />

                    {/* Add New Data Button */}
                    <div
                        className="w-full bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors shadow-sm"
                        onClick={handleAddNewData}
                    >
                        <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                                <Plus size={20} className="text-gray-600" />
                            </div>
                            <div>
                                <p className="font-medium text-gray-900">Add new data</p>
                                <p className="text-sm text-gray-500">
                                    Select which type of data you&apos;d like to add
                                </p>
                            </div>
                        </div>
                        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                            <Plus size={16} className="text-white" />
                        </div>
                    </div>
                </div>

                {/* Bottom Navigation */}
                <div className="fixed bottom-0 left-0 right-0 z-10">
                    <BottomNav
                        onAddClick={handleIdentityClick}
                        onScanToggle={() => setShowScanPopup(true)}
                        onActivityClick={handleActivityClick}
                        activeTab="identity"
                    />
                </div>
            </div>

            {/* Scan Action Popup */}
            <ScanActionPortal>
                <ScanActionPopup
                    visible={showScanPopup}
                    onClose={() => setShowScanPopup(false)}
                    onRequestCollect={handleRequestCollect}
                    onShareInPerson={handleShareInPerson}
                />
            </ScanActionPortal>
        </>
    );
}
