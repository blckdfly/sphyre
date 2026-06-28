"use client";

import React, { useState } from 'react';

interface CardData {
    title: string;
    issuer: string;
    issuedDate?: string;
    credentialId?: string;
    bgColor?: string;
    onClick?: () => void;
    signatureType?: string;
    bbsSignature?: string;
}

interface IdentityCardProps {
    cards: CardData[];
    maxCards?: number;
}

const IdentityCard: React.FC<IdentityCardProps> = ({ cards, maxCards = 3 }) => {
    const displayCards = cards.slice(0, maxCards);
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    const minSwipeDistance = 50;

    const handlePrevCard = () => {
        setActiveCardIndex((prev) => (prev === 0 ? displayCards.length - 1 : prev - 1));
    };

    const handleNextCard = () => {
        setActiveCardIndex((prev) => (prev === displayCards.length - 1 ? 0 : prev + 1));
    };

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
                const position = (index - activeCardIndex + displayCards.length) % displayCards.length;
                const isActiveCard = position === 0;

                const zIndex = displayCards.length - position;
                const topOffset = position === 0 ? 0 : -position * 12;

                const gradientPalette = [
                    'linear-gradient(140deg, rgba(0,2,102,1) 0%, rgba(0,5,255,0.85) 55%, rgba(102,104,255,0.7) 100%)',
                    'linear-gradient(140deg, rgba(0,2,102,1) 0%, rgba(51,55,255,0.85) 45%, rgba(152,206,242,0.65) 100%)',
                    'linear-gradient(140deg, rgba(0,2,102,1) 0%, rgba(51,55,255,0.75) 35%, rgba(204,205,255,0.65) 80%)'
                ];

                const backgroundStyle = card.bgColor || gradientPalette[index % gradientPalette.length];

                const isPrivacyPreserving = card.signatureType === 'bbs+' || Boolean(card.bbsSignature);

                const truncateId = (value?: string) => {
                    if (!value) return undefined;
                    return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
                };

                return (
                    <div
                        key={`${card.title}-${index}`}
                        className="absolute w-full transition-all duration-300 ease-in-out cursor-pointer"
                        style={{
                            top: `${topOffset}px`,
                            zIndex,
                            transform: isActiveCard ? 'scale(1)' : `scale(${0.98 - position * 0.02})`,
                            opacity: isActiveCard ? 1 : 0.9 - position * 0.1
                        }}
                        onClick={card.onClick}
                    >
                        <div
                            className="relative w-full h-48 rounded-3xl text-white overflow-hidden"
                            style={{ background: backgroundStyle }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent mix-blend-screen" />
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_55%)]" />

                            <div className="relative z-10 h-full w-full p-5 flex flex-col justify-between">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/65">Issuer</p>
                                        <p className="text-sm font-semibold text-white leading-tight max-w-[13rem]">{card.issuer}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold ${isPrivacyPreserving ? 'bg-white/25 text-white' : 'bg-black/30 text-white/80'} backdrop-blur-sm`}>
                                            {isPrivacyPreserving ? 'BBS+ Privacy' : 'Standard Signature'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-2xl font-semibold tracking-tight leading-tight text-white">
                                        {card.title}
                                    </h3>
                                    {card.credentialId && (
                                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">
                                            Credential • {truncateId(card.credentialId)}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-end justify-between text-xs text-white/75">
                                    <div className="space-y-1">
                                        <p className="uppercase tracking-[0.24em] text-[10px] text-white/60">Issued</p>
                                        <p className="text-sm font-medium text-white">
                                            {card.issuedDate || '—'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}

            <div className="w-full h-44 opacity-0"></div>
        </div>
    );
}
;

export default IdentityCard;
