'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Shield, User, Hash, Calendar } from 'lucide-react';

interface VerificationData {
  credential_id: string;
  credential_type: string;
  verifier_name?: string;
  verifier_did?: string;
  verified_at: string;
  attributes_shared?: string[];
}

// Separate component to use useSearchParams
const VerificationSuccessContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);

    // Get verification data from sessionStorage or URL params
    const storedData = sessionStorage.getItem('verification_success');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setVerificationData(data);
        sessionStorage.removeItem('verification_success');
      } catch (error) {
        console.error('Error parsing verification data:', error);
      }
      return;
    }

    const credentialId = searchParams.get('credential_id');
    const credentialType = searchParams.get('credential_type');
    const verifierName = searchParams.get('verifier_name');

    if (credentialId && credentialType) {
      setVerificationData({
        credential_id: credentialId,
        credential_type: credentialType,
        verifier_name: verifierName || 'Verifier',
        verified_at: new Date().toISOString(),
      });
      return;
    }

    redirectTimeoutRef.current = setTimeout(() => {
      router.push('/SSIWalletIdentity');
    }, 1000);

    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, [searchParams, router]);

  useEffect(() => {
    if (verificationData && redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
  }, [verificationData]);

  const handleGoHome = () => {
    router.push('/SSIWalletIdentity');
  };

  const handleViewActivity = () => {
    router.push('/SSIWalletActivity');
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-primary-500 flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  if (!verificationData) {
    return (
      <div className="min-h-screen bg-primary-500 flex items-center justify-center">
        <p className="text-white">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary-500">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-10">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
          <CheckCircle className="h-9 w-9 text-white" strokeWidth={2.25} />
        </div>

        <h1 className="mt-6 text-center text-2xl font-semibold text-white">Verification Successful</h1>
        <p className="mt-2 max-w-sm text-center text-sm text-primary-100">
          Your credential has been verified. You can safely close this screen or return to your wallet.
        </p>

        <div className="mt-8 w-full rounded-2xl bg-white p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Verification Details</span>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                <Shield className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">Credential Type</p>
                <p className="truncate text-sm font-medium text-gray-900">{verificationData.credential_type}</p>
              </div>
            </div>

            {verificationData.credential_id && (
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                  <Hash className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">Credential ID</p>
                  <p className="break-all text-xs font-mono text-gray-700">
                    {verificationData.credential_id.length > 36
                      ? verificationData.credential_id.slice(0, 36) + '...'
                      : verificationData.credential_id}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                <User className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">Verified By</p>
                <p className="text-sm font-medium text-gray-900">
                  {verificationData.verifier_name || 'Unknown Verifier'}
                </p>
                {verificationData.verifier_did && (
                  <p className="mt-1 truncate text-xs font-mono text-gray-500">
                    {verificationData.verifier_did}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">Verified At</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(verificationData.verified_at).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
            </div>

            {verificationData.attributes_shared && verificationData.attributes_shared.length > 0 && (
              <div>
                <p className="text-xs text-gray-500">Attributes Shared</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {verificationData.attributes_shared.map((attr, index) => (
                    <span
                      key={index}
                      className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-600"
                    >
                      {attr.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex w-full max-w-md flex-col gap-3">
          <button
            onClick={handleGoHome}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-primary-600 shadow-md transition hover:bg-primary-50"
          >
            Back to Wallet
          </button>

          <button
            onClick={handleViewActivity}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/40 bg-primary-600/70 py-3 text-sm font-semibold text-white transition hover:bg-primary-600"
          >
            View Activity History
          </button>
        </div>
      </div>
    </div>
  );
};

export default function VerificationSuccessPage() {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-primary-500 flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    }>
      <VerificationSuccessContent />
    </React.Suspense>
  );
}
