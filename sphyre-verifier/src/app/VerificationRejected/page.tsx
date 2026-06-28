'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { XCircle, ChevronLeft, AlertCircle, RefreshCw, Info, ShieldAlert } from 'lucide-react';

interface VerifierFailurePayload {
  reason?: string;
  error_code?: string | null;
  details?: unknown;
  presentation_data?: unknown;
  updated_at?: string;
  holder_label?: string;
}

const normalizeDetails = (details: unknown): Record<string, unknown> => {
  if (!details || typeof details !== 'object') {
    return {};
  }
  return details as Record<string, unknown>;
};

function VerificationRejectedContent() {
  const router = useRouter();
  const [payload, setPayload] = useState<VerifierFailurePayload | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = sessionStorage.getItem('verifier_verification_failure');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as VerifierFailurePayload;
        setPayload(parsed);
      } catch (error) {
        console.warn('Failed to parse verifier_verification_failure payload:', error);
      } finally {
        sessionStorage.removeItem('verifier_verification_failure');
      }
    }
  }, []);

  const storedHolderLabel = typeof window !== 'undefined'
    ? sessionStorage.getItem('verifier_last_holder_label') || sessionStorage.getItem('verifier_active_holder_label')
    : null;

  const reason = payload?.reason || 'The holder declined to share credentials';
  const errorCode = payload?.error_code || null;
  const failureDetails = useMemo(() => normalizeDetails(payload?.details), [payload]);
  const presentationData = useMemo(() => normalizeDetails(payload?.presentation_data), [payload]);
  const holderLabel = payload?.holder_label || storedHolderLabel || 'Anonymous holder';

  const detailEntries = Object.entries(failureDetails).filter(([, value]) => value != null);
  const presentationEntries = Object.entries(presentationData).filter(([, value]) => value != null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600">
      {/* Header */}
      <div className="p-4">
        <button
          onClick={() => router.push('/VerifierHome')}
          className="text-white hover:bg-white/10 p-2 rounded-full transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-white p-8">
        {/* Reject Icon */}
        <div className="w-32 h-32 bg-white/20 backdrop-blur-lg rounded-full flex items-center justify-center mb-8 animate-pulse">
          <XCircle size={80} className="text-white" />
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold mb-4 text-center">Verification Failed</h1>
        <p className="text-red-100 text-lg mb-8 text-center max-w-md">
          The holder did not approve this verification request or not meet the requirements
        </p>

        {/* Reason */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 max-w-md w-full">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={20} />
            <h2 className="font-semibold text-lg">Details</h2>
          </div>

          <p className="text-xs uppercase tracking-wide text-red-200 mb-2">Holder</p>
          <p className="font-mono text-xs break-all text-white/90 mb-4">{holderLabel}</p>

          <p className="text-red-100 leading-relaxed">{reason}</p>

          {errorCode && (
            <p className="mt-3 text-xs uppercase tracking-wide text-red-200">
              Error Code: <span className="font-mono text-red-100">{errorCode}</span>
            </p>
          )}
        </div>

        {/* Additional Failure Details */}
        {detailEntries.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 max-w-md w-full">
            <div className="flex items-center gap-2 mb-3">
              <Info size={20} />
              <h3 className="font-semibold text-lg">Additional Context</h3>
            </div>
            <div className="space-y-3">
              {detailEntries.map(([key, value]) => (
                <div key={key} className="bg-white/10 rounded-lg p-3">
                  <p className="text-xs text-red-200 uppercase tracking-wide">{key.replace(/_/g, ' ')}</p>
                  <p className="text-sm text-white break-words font-mono">
                    {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Presentation Data Snapshot */}
        {presentationEntries.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 max-w-md w-full">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={20} />
              <h3 className="font-semibold text-lg">Presentation Snapshot</h3>
            </div>
            <div className="space-y-2 text-sm text-white/80 font-mono break-words">
              {presentationEntries.map(([key, value]) => (
                <div key={key} className="bg-white/10 rounded-lg p-3">
                  <p className="text-xs uppercase tracking-wide text-red-200 mb-1">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-white break-words">
                    {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3 w-full max-w-md">
          <button
            onClick={() => router.push('/VerifierHome')}
            className="w-full px-6 py-4 bg-white text-red-600 rounded-full font-medium hover:bg-red-50 transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <RefreshCw size={20} />
            Try Again
          </button>

          <button
            onClick={() => router.push('/VerifierActivity')}
            className="w-full px-6 py-4 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
          >
            View Activity Log
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerificationRejectedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-red-600 to-pink-600 flex items-center justify-center">
          <div className="text-center text-white">
            <div className="animate-spin h-12 w-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Loading...</p>
          </div>
        </div>
      }
    >
      <VerificationRejectedContent />
    </Suspense>
  );
}
