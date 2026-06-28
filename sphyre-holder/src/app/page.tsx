'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import walletService from '@/services/walletService';
import LoadingScreen from '@/components/ui/LoadingScreen';

export default function Home() {
    const router = useRouter();

    useEffect(() => {
        // Redirect logic with PIN check
        if (walletService.isSessionAuthenticated()) {
            // User is logged in (session active) → go to wallet
            router.push('/SSIWalletIdentity');
        } else if (walletService.isPersistentLoginEnabled()) {
            router.push('/unlock');
        } else if (walletService.isInitialized()) {
            router.push('/unlock');
        } else {
            // No wallet → go to onboarding
            router.push('/onboarding');
        }
    }, [router]);

    // Show loading while redirecting
    return <LoadingScreen message="Loading Sphyre Wallet" subMessage="Verifying your identity credentials" />;
}