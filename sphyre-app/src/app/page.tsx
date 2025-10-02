'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
    const router = useRouter();

    useEffect(() => {
        router.push('/SSIWalletIdentity');
    }, [router]);

    return (
        <div className="flex items-center justify-center h-screen bg-black">
            <p className="text-white">Loading SSI Wallet...</p>
        </div>
    );
}