'use client';

import React, { useState } from 'react';
import Image from 'next/image';

interface CardData {
    title: string;
    issuer: string;
    bgColor?: string;
    onClick?: () => void;
}

interface IdentityCardProps {
    cards: CardData[];
    maxCards?: number;
}

const IdentityCard: React.FC<IdentityCardProps> = ({ cards, maxCards = 3 }) => {
    // Limit the number of cards to maxCards
    const displayCards = cards.slice(0, maxCards);
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    // Minimum swipe distance (in px)
    const minSwipeDistance = 50;

    const handlePrevCard = () => {
        setActiveCardIndex((prev) => (prev === 0 ? displayCards.length - 1 : prev - 1));
    };

    const handleNextCard = () => {
        setActiveCardIndex((prev) => (prev === displayCards.length - 1 ? 0 : prev + 1));
    };

    // Touch event handlers for swipe gestures
    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            handleNextCard();
        } else if (isRightSwipe) {
            handlePrevCard();
        }
    };

    return (
        <div 
            className="relative mb-6"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {displayCards.map((card, index) => {
                // Calculate position based on active card
                const position = (index - activeCardIndex + displayCards.length) % displayCards.length;
                const isActiveCard = position === 0;

                // Calculate z-index and visual properties
                const zIndex = displayCards.length - position;
                // Negative topOffset makes cards stack upward
                const topOffset = position === 0 ? 0 : -position * 12; // -8px offset for each card behind

                return (
                    <div 
                        key={index}
                        className={`absolute w-full transition-all duration-300 ease-in-out`}
                        style={{ 
                            top: `${topOffset}px`, 
                            zIndex,
                            transform: isActiveCard ? 'scale(1)' : `scale(${0.98 - position * 0.02})`,
                            opacity: isActiveCard ? 1 : 0.9 - position * 0.1
                        }}
                    >
                        <div 
                            className="relative w-full h-44 rounded-2xl text-white shadow-lg overflow-hidden p-4"
                            style={{ backgroundColor: card.bgColor || '#0D2B6B' }}
                            onClick={card.onClick}
                        >
                            <div className="absolute inset-0 opacity-10">
                                <Image
                                    src="/assets/background-badge.png"
                                    alt="Background Texture"
                                    fill
                                    style={{ objectFit: 'cover' }}
                                    className="rounded-2xl"
                                />
                            </div>
                            <div className="relative z-10">
                                <p className="text-sm left-10 font-semibold">{card.title}</p>
                                <p className="text-xs left-6 mb-4">{card.issuer}</p>
                            </div>
                            <div className="absolute bottom-5 right-6 z-10 flex items-center gap-2">
                                <div className="w-8 h-2 rounded-full bg-green-500" />
                            </div>
                            <div className="absolute bottom-4 left-6 z-10 flex items-center gap-2">
                                <Image
                                    src="/assets/sphyre-text.png"
                                    alt="Sphyre"
                                    width={90}
                                    height={30}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* This empty div ensures proper spacing */}
            <div className="w-full h-44 opacity-0"></div>
        </div>
    );
};

export default IdentityCard;
