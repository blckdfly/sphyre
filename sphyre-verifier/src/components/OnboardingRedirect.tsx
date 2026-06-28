'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import verifierAuthService from '../services/verifierAuthService';

export default function OnboardingRedirect() {
  const router = useRouter();

  useEffect(() => {
    const isLoggedIn = verifierAuthService.isLoggedIn();
    const isAuthenticated = verifierAuthService.isSessionAuthenticated();
    
    if (!isLoggedIn) {
      router.replace('/onboarding');
    } else if (!isAuthenticated) {
      router.replace('/login');
    } else {
      router.replace('/VerifierHome');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
