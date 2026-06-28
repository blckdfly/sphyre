'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { XCircle, AlertTriangle, User, Hash, Calendar, ChevronRight, Home, RefreshCw } from 'lucide-react';

interface AttributeMismatchDetail {
  attribute: string;
  actual?: string;
  status: 'missing' | 'value_mismatch';
}

interface VerificationFailureData {
  credential_id?: string;
  credential_type?: string;
  verifier_name?: string;
  verifier_did?: string;
  failed_at: string;
  reason?: string;
  error_code?: string;
  attributes_missing?: string[];
  attribute_value_mismatches?: AttributeMismatchDetail[];
}

const VerificationFailureContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [failureData, setFailureData] = useState<VerificationFailureData | null>(null);

  useEffect(() => {
    setMounted(true);

    // Get failure data from sessionStorage or URL params
    const storedData = sessionStorage.getItem('verification_failure');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setFailureData(data);
        sessionStorage.removeItem('verification_failure');
      } catch (error) {
        console.error('Error parsing failure data:', error);
      }
    } else {
      const credentialId = searchParams.get('credential_id');
      const credentialType = searchParams.get('credential_type');
      const verifierName = searchParams.get('verifier_name');
      const reason = searchParams.get('reason');
      const errorCode = searchParams.get('error_code');
      
      if (credentialId || reason) {
        setFailureData({
          credential_id: credentialId || undefined,
          credential_type: credentialType || undefined,
          verifier_name: verifierName || 'Verifier',
          failed_at: new Date().toISOString(),
          reason: reason || 'Verification failed',
          error_code: errorCode || undefined,
        });
      }
    }
  }, [searchParams]);

  const handleGoHome = () => {
    router.push('/SSIWalletIdentity');
  };

  const handleRetry = () => {
    // Go back to credential selection
    router.push('/CredentialSelection');
  };

  const handleViewActivity = () => {
    router.push('/SSIWalletActivity');
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!failureData) {
    setTimeout(() => {
      router.push('/SSIWalletIdentity');
    }, 1000);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
        <p className="text-gray-600">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-red-500/10">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-10">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg">
          <XCircle className="h-9 w-9 text-red-600" strokeWidth={2.25} />
        </div>

        <h1 className="mt-6 text-center text-2xl font-semibold text-red-700">Verification Failed</h1>
        <p className="mt-2 max-w-sm text-center text-sm text-red-600">
          We couldn’t complete the verification. Review the details below and try again if needed.
        </p>

        <div className="mt-8 w-full rounded-2xl bg-white p-6 shadow-xl ring-1 ring-red-100">
          {failureData.reason && (
            <div className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 px-3 py-4">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">{failureData.reason}</p>
                {failureData.error_code && (
                  <p className="mt-1 text-xs font-mono text-red-500">Code: {failureData.error_code}</p>
                )}
              </div>
            </div>
          )}

          {failureData.attributes_missing && failureData.attributes_missing.length > 0 && (
            <div className="mb-5 rounded-xl bg-white px-3 py-4 shadow-sm ring-1 ring-red-100">
              <p className="text-xs font-semibold text-red-600">Missing Attributes</p>
              <ul className="mt-2 space-y-1">
                {failureData.attributes_missing.map((attr, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs text-red-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    {attr}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {failureData.attribute_value_mismatches && failureData.attribute_value_mismatches.length > 0 && (
            <div className="mb-5 rounded-xl bg-white px-3 py-4 shadow-sm ring-1 ring-red-100">
              <p className="text-xs font-semibold text-red-600">Attributes Needing Attention</p>
              <ul className="mt-2 space-y-2">
                {failureData.attribute_value_mismatches.map((detail, idx) => (
                  <li key={`mismatch-${idx}`} className="flex flex-col text-xs text-red-700">
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      {detail.attribute}
                    </div>
                    <div className="ml-4 mt-1 text-red-600">
                      {detail.status === 'missing'
                        ? 'This attribute is required but was not shared.'
                        : detail.actual
                          ? `Provided value "${detail.actual}" does not meet the verifier policy.`
                          : 'The provided value does not meet the verifier policy.'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            {failureData.credential_type && (
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <Hash className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">Credential Type</p>
                  <p className="text-sm font-medium text-gray-900">{failureData.credential_type}</p>
                </div>
              </div>
            )}

            {failureData.verifier_name && (
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <User className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">Verifier</p>
                  <p className="text-sm font-medium text-gray-900">{failureData.verifier_name}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">Time</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(failureData.failed_at).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex w-full max-w-md flex-col gap-3">
          <button
            onClick={handleRetry}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-red-700"
          >
            <RefreshCw className="h-5 w-5" />
            Try Again
          </button>

          <button
            onClick={handleGoHome}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-red-600 shadow-md transition hover:bg-red-50"
          >
            <Home className="h-5 w-5" />
            Back to Wallet
          </button>

          <button
            onClick={handleViewActivity}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100"
          >
            <ChevronRight className="h-5 w-5" />
            View Activity
          </button>
        </div>
      </div>
    </div>
  );
}
;

function VerificationFailureLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
      <p className="text-gray-600">Loading...</p>
    </div>
  );
}

export default function VerificationFailurePage() {
  return (
    <Suspense fallback={<VerificationFailureLoading />}>
      <VerificationFailureContent />
    </Suspense>
  );
}
