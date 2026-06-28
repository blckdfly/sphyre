'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, Suspense } from 'react';
import { ChevronLeft, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

function WaitingForHolderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get('requestId');
  const initialHolderLabel =
    searchParams.get('holderPseudonym') ||
    searchParams.get('holderLabel') ||
    searchParams.get('holderDID') ||
    (typeof window !== 'undefined'
      ? sessionStorage.getItem('verifier_active_holder_label')
      : null);
  
  const [countdown, setCountdown] = useState(300);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'expired'>('pending');
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollCountRef = useRef(0);
  const [holderLabel, setHolderLabel] = useState<string | null>(initialHolderLabel);

  // Poll for status
  useEffect(() => {
    if (!requestId) {
      console.error('No requestId found, redirecting to Scan');
      router.push('/Scan');
      return;
    }
    
    console.log('Starting polling for requestId:', requestId);
    console.log('Polling URL:', `${API_URL}/api/wallet/presentation-requests/${requestId}/status`);
    
    const pollInterval = setInterval(async () => {
      try {
        pollCountRef.current += 1;
        setPollCount(pollCountRef.current);
        console.log(`Polling status... (attempt #${pollCountRef.current})`);
        const response = await fetch(
          `${API_URL}/api/wallet/presentation-requests/${requestId}/status`
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Polling failed:', response.status, response.statusText, errorText);
          setPollError(`HTTP ${response.status}: ${response.statusText}`);
          return;
        }
        
        const data = await response.json();
        console.log('Poll response:', data);
        console.log('Status check:', {
          currentStatus: data.status,
          hasData: !!data.presentation_data,
          timestamp: data.updated_at,
        });
        setPollError(null);
        const resolvedHolderLabel =
          data.holder_pseudonym ||
          data.request?.holder_pseudonym ||
          data.request?.holder_did ||
          null;
        if (resolvedHolderLabel) {
          setHolderLabel(resolvedHolderLabel);
        }
        
        if (data.status === 'approved') {
          setStatus('approved');
          clearInterval(pollInterval);
          sessionStorage.removeItem('verifier_verification_failure');
          sessionStorage.setItem('presentation_data', JSON.stringify(data.presentation_data));
          if (resolvedHolderLabel) {
            sessionStorage.setItem('verifier_last_holder_label', resolvedHolderLabel);
          }
          
          setTimeout(() => {
            router.push(`/VerificationSuccess?requestId=${requestId}`);
          }, 2000);
          
        } else if (data.status === 'rejected') {
          setStatus('rejected');
          clearInterval(pollInterval);          
          setTimeout(() => {
            const failurePayload = {
              reason: data.rejection_reason,
              error_code: data.failure_code,
              details: data.failure_details,
              presentation_data: data.presentation_data ?? null,
              updated_at: data.updated_at,
              holder_label: resolvedHolderLabel,
            };
            sessionStorage.setItem('verifier_verification_failure', JSON.stringify(failurePayload));
            router.push('/VerificationRejected');
          }, 2000);
          
        } else if (data.status === 'expired') {
          setStatus('expired');
          clearInterval(pollInterval);
          setTimeout(() => {
            const failurePayload = {
              reason: 'Request expired (5 minute timeout)',
              error_code: 'REQUEST_EXPIRED',
              details: {
                request_id: requestId,
              },
              presentation_data: data.presentation_data ?? null,
              updated_at: data.updated_at,
              holder_label: resolvedHolderLabel,
            };
            sessionStorage.setItem('verifier_verification_failure', JSON.stringify(failurePayload));
            router.push('/VerificationRejected');
          }, 2000);
        }
      } catch (error) {
        console.error('Polling error:', error);
        setPollError(error instanceof Error ? error.message : 'Network error');
      }
    }, 2000); 
    
    return () => clearInterval(pollInterval);
  }, [requestId, router]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-primary-500">
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
        {status === 'pending' && (
          <>
            {/* Loading Animation */}
            <Loader2 size={96} className="animate-spin mb-8" />
            
            {/* Status */}
            <h1 className="text-3xl font-bold mb-4">Waiting for Holder</h1>
            <p className="text-blue-100 text-lg mb-8 text-center max-w-md">
              Holder is reviewing your verification request and selecting attributes to share...
            </p>
            
            {/* Holder Info */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8 max-w-md w-full">
              <p className="text-sm text-blue-100 mb-2">Holder:</p>
              <p className="font-mono text-sm break-all">
                {holderLabel || 'Awaiting holder confirmation'}
              </p>
            </div>
            
            {/* Instructions */}
            <div className="text-center max-w-md mb-6">
              <p className="text-blue-100">
                The holder is reviewing your verification request. 
                This usually takes less than a minute.
              </p>
            </div>
            
            {/* Countdown */}
            <div className="flex items-center gap-2 text-blue-200 mb-4">
              <Clock size={16} />
              <p className="text-sm">
                Request expires in: {formatTime(countdown)}
              </p>
            </div>
            
            {/* Poll Status (Debug) */}
            <div className="text-xs text-blue-300 text-center">
              <p>Polling... (attempt #{pollCount})</p>
              {pollError && (
                <p className="text-red-400 mt-2 bg-red-900/30 px-3 py-2 rounded-lg">
                  {pollError}
                </p>
              )}
            </div>
          </>
        )}

        {status === 'approved' && (
          <>
            <CheckCircle2 size={96} className="text-green-400 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Presentation Received!</h1>
            <p className="text-blue-100">Redirecting to presentation details...</p>
          </>
        )}

        {status === 'rejected' && (
          <>
            <XCircle size={96} className="text-red-400 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Request Rejected</h1>
            <p className="text-blue-100 mb-6">The holder declined to share credentials.</p>
            <button
              onClick={() => router.push('/Scan')}
              className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              Back to Scan
            </button>
          </>
        )}

        {status === 'expired' && (
          <>
            <Clock size={96} className="text-yellow-400 mb-4" />
            <h1 className="text-2xl font-bold mb-2">Request Expired</h1>
            <p className="text-blue-100 mb-6">The verification request has timed out.</p>
            <button
              onClick={() => router.push('/Scan')}
              className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              Back to Scan
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function WaitingForHolderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 size={48} className="animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    }>
      <WaitingForHolderContent />
    </Suspense>
  );
}
