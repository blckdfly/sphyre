'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import verifierAuthService from '../services/verifierAuthService';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = () => {
      const isLoggedIn = verifierAuthService.isLoggedIn();
      const isAuthenticated = verifierAuthService.isSessionAuthenticated();

      if (!isLoggedIn) {
        router.push('/onboarding');
        return;
      }

      if (!isAuthenticated) {
        router.push('/login');
        return;
      }
    };

    checkAuth();
  }, [router]);

  // Check authentication state
  const isLoggedIn = verifierAuthService.isLoggedIn();
  const isAuthenticated = verifierAuthService.isSessionAuthenticated();

  if (!isLoggedIn || !isAuthenticated) {
    // Show loading while redirecting
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}
