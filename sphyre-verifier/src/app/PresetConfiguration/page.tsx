"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
    DriverLicenseIcon, 
    Age21Icon, 
    Age18Icon 
} from '@/components/ui/Icons';
import HeaderWithBack from '@/components/ui/HeaderWithBack';
import UseCaseCard from '@/components/ui/UseCaseCard';
import DataFields from '@/components/ui/DataFields';

const PresetConfigurationPage: React.FC = () => {
    const router = useRouter();
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set(['driver']));
    const [selectedCard, setSelectedCard] = useState<string>('age18');

    const handleCardToggle = (cardId: string) => {
        const newExpandedCards = new Set(expandedCards);
        if (newExpandedCards.has(cardId)) {
            newExpandedCards.delete(cardId);
        } else {
            newExpandedCards.add(cardId);
        }
        setExpandedCards(newExpandedCards);
    };

    const handleCardSelect = (cardId: string) => {
        setSelectedCard(cardId);
    };

    const driverLicenseFields = [
        'Sex', 'Portrait', 'Birth date', 'Given name', 'Family name',
        'Issue date', 'Expiry date', 'Resident address', 'Resident city',
        'Resident state', 'Resident country', 'Document number',
        'Issuing country', 'Issuing authority', 'Driving privileges'
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <HeaderWithBack 
                title="Preset configuration" 
                onBackClick={() => router.back()}
            />

            {/* Content */}
            <div className="p-6">
                {/* Description */}
                <div className="mb-8">
                    <p className="text-gray-700 leading-relaxed">
                        Select the type of use case you would like to request from your holder.
                    </p>
                </div>

                {/* Use case section */}
                <div className="mb-6">
                    <h2 className="text-gray-500 text-sm font-medium mb-4">Use case</h2>

                    <div className="space-y-4">
                        {/* Driver licence card */}
                        <UseCaseCard
                            icon={<DriverLicenseIcon className="w-6 h-6 text-gray-700" />}
                            title="Driver licence"
                            cardId="driver"
                            isExpanded={expandedCards.has('driver')}
                            isSelected={selectedCard === 'driver'}
                            onToggle={() => handleCardToggle('driver')}
                            onSelect={() => handleCardSelect('driver')}
                        >
                            <DataFields fields={driverLicenseFields} />
                        </UseCaseCard>

                        {/* Age verification (21+) card */}
                        <UseCaseCard
                            icon={<Age21Icon className="w-6 h-6" />}
                            title="Age verification (21+)"
                            cardId="age21"
                            isExpanded={expandedCards.has('age21')}
                            isSelected={selectedCard === 'age21'}
                            onToggle={() => handleCardToggle('age21')}
                            onSelect={() => handleCardSelect('age21')}
                        >
                            <DataFields fields={['Portrait', 'Age over 21']} label="Age verification" />
                        </UseCaseCard>

                        {/* Age verification (18+) card - Selected */}
                        <UseCaseCard
                            icon={<Age18Icon className="w-6 h-6" />}
                            title="Age verification (18+)"
                            cardId="age18"
                            isExpanded={expandedCards.has('age18')}
                            isSelected={selectedCard === 'age18'}
                            onToggle={() => handleCardToggle('age18')}
                            onSelect={() => handleCardSelect('age18')}
                        >
                            <DataFields fields={['Portrait', 'Age over 18']} label="Age verification" />
                        </UseCaseCard>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default PresetConfigurationPage;