'use client';

import React, { useState, useCallback } from 'react';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SimpleQRScanner } from '@/components/QRScanner/SimpleQRScanner';

type PayloadResponse = {
  type?: 'credential_offer' | 'presentation_request';
  [key: string]: unknown;
};

export default function QRScannerPage() {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (typeof window !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          stream.getTracks().forEach(track => track.stop());
        })
        .catch(() => {});
    }
  }, []);

  const navigateAfterScan = useCallback((path: string) => {
    stopCamera();
    setTimeout(() => router.push(path), 100);
  }, [router, stopCamera]);

  const checkUrlFormat = useCallback((url: string): 'credential_offer' | 'presentation_request' | null => {
    try {
      const parsed = new URL(url);
      const typeParam = parsed.searchParams.get('type')?.toLowerCase();
      if (typeParam === 'offer' || typeParam === 'credential_offer') return 'credential_offer';
      if (typeParam === 'request' || typeParam === 'presentation_request') return 'presentation_request';

      const path = parsed.pathname.toLowerCase();
      if (path.includes('/offer') || path.includes('/credential')) return 'credential_offer';
      if (path.includes('/request') || path.includes('/presentation')) return 'presentation_request';
      return null;
    } catch {
      return null;
    }
  }, []);

  const fetchPayload = useCallback(async (url: string): Promise<PayloadResponse> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch payload. Status: ${response.status}`);
    }
    return response.json();
  }, []);

  const handleResolvedPayload = useCallback((payload: PayloadResponse, fallbackType: 'credential_offer' | 'presentation_request' | null, rawSource?: string) => {
    const type = payload.type || fallbackType;
    const typeStr = String(type);

    if (typeStr === 'credential_offer' || typeStr === 'credential-offer') {
      const payloadRec = payload as Record<string, unknown>;
      const offerData = (payloadRec.content as Record<string, unknown>)?.data || payloadRec.data || payload;
      console.log('Credential offer detected:', offerData);
      sessionStorage.setItem('credential_offer', JSON.stringify(offerData));
      navigateAfterScan('/CollectCredentials');
      return;
    }

    if (typeStr === 'presentation_request' || typeStr === 'presentation-request') {
      const payloadRec = payload as Record<string, unknown>;
      const requestData = (payloadRec.content as Record<string, unknown>)?.data || payloadRec.data || payload;
      
      console.log('Presentation request detected:', requestData);
    
      // Handle both request_id and id fields for compatibility
      const requestId = (requestData as Record<string, unknown>)?.request_id || 
                       (requestData as Record<string, unknown>)?.id;
      if (requestId) {
        console.log('Extracted request_id from QR:', requestId);
        sessionStorage.setItem('presentation_request_id', String(requestId));
      } else {
        console.warn('No request_id or id found in QR payload');
      }
      
      sessionStorage.setItem('presentation_request', JSON.stringify(requestData));
      sessionStorage.setItem('pending_presentation_redirect', '/CredentialRequest');
      navigateAfterScan('/SSIWalletActivity');
      return;
    }

    if (payload && Object.keys(payload).length > 0) {
      sessionStorage.setItem('qr_data', JSON.stringify(payload));
    }
    if (rawSource) {
      sessionStorage.setItem('qr_url', rawSource);
    }
    navigateAfterScan('/SSIWalletIdentity');
  }, [navigateAfterScan]);

  // Handle QR code scan
  const handleQRCodeScan = useCallback(async (qrData: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      console.log('Processing QR code:', qrData);
      if (qrData.startsWith('http://') || qrData.startsWith('https://')) {
        const inferredType = checkUrlFormat(qrData);
        let payload: PayloadResponse | null = null;

        try {
          payload = await fetchPayload(qrData);
        } catch (fetchError) {
          console.error('Error fetching QR payload:', fetchError);
          if (inferredType) {
            payload = { type: inferredType, url: qrData };
          } else {
            throw fetchError;
          }
        }

        handleResolvedPayload(payload, inferredType, qrData);
        return;
      }

      try {
        const data = JSON.parse(qrData) as PayloadResponse;
        handleResolvedPayload(data, data.type ?? null, qrData);
      } catch {
        sessionStorage.setItem('qr_raw', qrData);
        navigateAfterScan('/SSIWalletIdentity');
      }
    } catch (err) {
      console.error('Error processing QR code:', err);
      setError('Failed to process QR code. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [checkUrlFormat, fetchPayload, handleResolvedPayload, navigateAfterScan]);

  const handleScanError = useCallback((err: Error) => {
    console.error('QR Scanner error:', err);
    setError(err.message);
  }, [setError]);

  // Handle back button
  const handleBack = () => {
    router.back();
  };

  return (
    <div className="min-h-screen bg-dark-500">
      <div className="absolute top-0 left-0 right-0 z-20 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="p-2 bg-dark-500 bg-opacity-50 rounded-full text-light-50 hover:bg-opacity-70 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-light-50 text-lg font-medium">Scan QR Code</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md">
          {error && (
            <div className="mb-4 p-4 bg-error-100 border border-error-400 text-error-700 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                <p>{error}</p>
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-500 bg-opacity-75 z-30">
              <div className="bg-light-50 p-6 rounded-lg">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500 mx-auto"></div>
                <p className="mt-3 text-dark-500">Processing QR code...</p>
              </div>
            </div>
          )}

          <SimpleQRScanner
            onScan={handleQRCodeScan}
            onError={handleScanError}
            facingMode="environment"
          />
        </div>
      </div>
    </div>
  );
}
