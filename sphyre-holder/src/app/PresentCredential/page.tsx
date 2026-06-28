'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { storeVerificationFailure, buildFailureData } from '@/utils/verificationHelpers';
import { QRCodeSVG } from 'qrcode.react';
import { ChevronLeft, RefreshCw, Clock } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

const getStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const getPresentationIdFromRequest = (request: Record<string, unknown>): string | undefined => {
  const direct = request['presentation_id'];
  if (typeof direct === 'string') return direct;
  const camel = request['presentationId'];
  return typeof camel === 'string' ? camel : undefined;
};

const getRequestIdFromRequest = (request: Record<string, unknown>): string | undefined => {
  const snake = request['request_id'];
  if (typeof snake === 'string') return snake;
  const plain = request['id'];
  if (typeof plain === 'string') return plain;
  return undefined;
};

const getRequiredAttributes = (request: Record<string, unknown>): string[] => {
  const snake = getStringArray(request['required_attributes']);
  if (snake.length > 0) return snake;
  return getStringArray(request['requiredAttributes']);
};

const getRequiredAttributeValues = (
  request: Record<string, unknown>,
): Record<string, string[]> => {
  const raw =
    (request['required_attribute_values'] as Record<string, unknown> | undefined) ||
    (request['requiredAttributeValues'] as Record<string, unknown> | undefined);

  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const result: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!key || typeof key !== 'string') continue;

    const valuesArray = getStringArray(value);
    if (valuesArray.length === 0) continue;

    const normalizedKey = key.trim();
    if (!normalizedKey) continue;

    result[normalizedKey] = valuesArray.filter((candidate) => candidate.trim().length > 0);
  }

  return result;
};

const getOptionalAttributes = (request: Record<string, unknown>): string[] => {
  const snake = getStringArray(request['requested_attributes']);
  if (snake.length > 0) return snake;
  return getStringArray(request['requestedAttributes']);
};

const getRequiredPredicates = (request: Record<string, unknown>): unknown[] => {
  const predicates = request['required_predicates'];
  console.log('getRequiredPredicates called - predicates field:', predicates);
  const result = Array.isArray(predicates) ? predicates : [];
  console.log('getRequiredPredicates result:', result);
  return result;
};

const getStringProperty = (request: Record<string, unknown>, key: string): string | undefined => {
  const value = request[key];
  return typeof value === 'string' ? value : undefined;
};

interface Credential {
  id: string;
  credential_type: string;
  issuer_did: string;
  issuer_name?: string;
  issuedDate?: string;
  status?: string;
  credential_preview?: Record<string, unknown>;
  credential_data?: Record<string, unknown>; 
}

export default function PresentCredentialPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [holder_did, setHolderDID] = useState<string>('');
  const [qrData, setQrData] = useState<string>('');
  const [expiresIn, setExpiresIn] = useState<number>(30);
  const [presentationCount, setPresentationCount] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    sessionStorage.removeItem('presentation_request_id');
    sessionStorage.removeItem('verifier_requirements');
    sessionStorage.removeItem('active_presentation_id');
    sessionStorage.removeItem('active_presentation_nonce');
  }, []);

  const generateQRCode = useCallback(() => {
    if (!credential || !holder_did) return;

    setIsGenerating(true);

    try {
      const newNonce = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const ephemeralID = `pres_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const presentationRequest = {
        type: 'credential_presentation',
        credential_id: credential.id,
        credential_type: credential.credential_type,
        holder_did,
        presentation_id: ephemeralID,
        nonce: newNonce,
        timestamp: Date.now(),
        expires_at: Date.now() + 30000,
        expires_in: 30,
      };

      sessionStorage.removeItem('presentation_request_id');
      sessionStorage.setItem('active_presentation_id', ephemeralID);
      sessionStorage.setItem('active_presentation_nonce', newNonce);

      const qrPayload = JSON.stringify(presentationRequest);

      setQrData(qrPayload);
      setExpiresIn(30);
      setPresentationCount(prev => prev + 1);

      console.log('QR Generated:', {
        presentation_id: ephemeralID,
        nonce: newNonce.substring(0, 16) + '...',
        expires_at: new Date(Date.now() + 30000).toISOString(),
        count: presentationCount + 1,
      });
      
    } catch (error) {
      console.error('Failed to generate QR:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [credential, holder_did, presentationCount]);

  // Load credential from sessionStorage
  useEffect(() => {
    setMounted(true);

    const storedCredential = sessionStorage.getItem('selected_credential_for_sharing');
    const storedHolderDID = sessionStorage.getItem('holder_did_for_presentation');

    console.log('Loading credential from sessionStorage...');
    console.log('Stored credential exists:', !!storedCredential);
    console.log('Stored holder DID exists:', !!storedHolderDID);

    if (!storedCredential || !storedHolderDID) {
      console.error('Missing credential or holder DID');
      router.push('/ShareCredentials');
      return;
    }

    try {
      const parsedCredential = JSON.parse(storedCredential);
      
      console.log('Credential parsed successfully');
      console.log('Credential structure:', {
        id: parsedCredential.id,
        credential_type: parsedCredential.credential_type,
        has_credential_preview: !!parsedCredential.credential_preview,
        has_credential_data: !!parsedCredential.credential_data,
        credential_preview_keys: Object.keys(parsedCredential.credential_preview || {}),
        credential_data_keys: Object.keys(parsedCredential.credential_data || {}),
      });
      
      if (!parsedCredential.credential_preview && !parsedCredential.credential_data) {
        console.warn('Credential has no attributes in preview or data!');
      }
      
      setCredential(parsedCredential);
      setHolderDID(storedHolderDID);
    } catch (error) {
      console.error('Error parsing credential:', error);
      console.error('Raw stored credential:', storedCredential?.substring(0, 200));
      router.push('/ShareCredentials');
    }
  }, [router]);

  // Generate initial QR when credential loads
  useEffect(() => {
    if (credential && holder_did && !qrData) {
      generateQRCode();
    }
  }, [credential, holder_did, qrData, generateQRCode]);

  useEffect(() => {
    if (!qrData) return;

    const regenerateInterval = setInterval(() => {
      console.log('30 seconds elapsed, regenerating QR...');
      generateQRCode();
    }, 30000); 

    return () => clearInterval(regenerateInterval);
  }, [qrData, generateQRCode]);

  useEffect(() => {
    if (!qrData) return;

    const countdownInterval = setInterval(() => {
      setExpiresIn(prev => {
        if (prev <= 1) {
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [qrData]);

  useEffect(() => {
    if (!holder_did || !qrData) return;
    
    console.log('Initialized with holder_did:', {
      holder_did,
      length: holder_did.length,
      starts_with: holder_did.substring(0, 20) + '...',
    });
    
    const requestIdFromQR = sessionStorage.getItem('presentation_request_id');
    console.log('Request ID from QR:', requestIdFromQR);
    
    const pollInterval = setInterval(async () => {
      try {
        const activePresentationId = sessionStorage.getItem('active_presentation_id');
        let requestIdFromSession = sessionStorage.getItem('presentation_request_id');
        const useSpecificRequest = !!requestIdFromSession;

        let pollUrl: string;
        if (useSpecificRequest) {
          pollUrl = `${API_URL}/api/wallet/presentation-requests/${requestIdFromSession}/status`;
        } else {
          const encodedDID = encodeURIComponent(holder_did);
          pollUrl = `${API_URL}/api/wallet/presentation-requests/${encodedDID}/pending`;
        }

        console.log('Checking for presentation requests...', {
          holder_did,
          url: pollUrl,
          useSpecificRequest,
          activePresentationId
        });

        const response = await fetch(pollUrl);
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          console.error('Failed:', response.statusText);
          return;
        }
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success && (!data.requests || data.requests.length === 0) && !useSpecificRequest) {
          console.log('No requests found for holder_did:', holder_did);
          console.log('Try fetching any recent request to compare DIDs...');
        }

        let request: Record<string, unknown> | undefined;
        if (useSpecificRequest) {
          if (data.success && data.request_id) {
            request = data;
          } else {
            console.log('Specific request polling did not return a valid request payload yet');
            return;
          }
        } else if (Array.isArray(data.requests) && data.requests.length > 0) {
          if (activePresentationId) {
            request = data.requests.find((req: Record<string, unknown>) => {
              const reqPresentationId = (req.presentation_id as string | undefined) || (req.presentationId as string | undefined);
              return reqPresentationId === activePresentationId;
            });
          } else {
            request = data.requests[0];
          }

          if (!request) {
            console.log('Pending requests exist but none match the active presentation ID');
            return;
          }
        }

        if (!request) {
          console.log('No matching presentation request yet');
          return;
        }

        const requestPresentationId = getPresentationIdFromRequest(request);
        if (activePresentationId) {
          if (!requestPresentationId) {
            console.log('Request detected without presentation_id, waiting for matching request');
            return;
          }

          if (requestPresentationId !== activePresentationId) {
            console.log('Presentation ID mismatch, ignoring request', {
              expected: activePresentationId,
              received: requestPresentationId,
            });
            return;
          }
        }

        if (!useSpecificRequest) {
          const requestIdToStore = getRequestIdFromRequest(request);
          if (requestIdToStore) {
            sessionStorage.setItem('presentation_request_id', requestIdToStore);
            requestIdFromSession = requestIdToStore;
          }
        }

        if (useSpecificRequest && data.status) {
          console.log('Got specific request status:', data.status);

          if (data.status === 'approved') {
            console.log('Request already approved!');
            return;
          }

          if (data.status !== 'pending') {
            console.log('Request status not pending:', data.status);
            return;
          }
        }

        console.log('Request detected!', request);
        console.log('Credential object:', credential);
        console.log('Credential preview:', credential?.credential_preview);
        console.log('Credential data:', credential?.credential_data);

        const norm = (s: string) => (s || '').toString().toLowerCase().replace(/\s+/g, '_');
        const previewAttrs = Object.keys(credential?.credential_preview || {});
        const dataAttrs = Object.keys(credential?.credential_data || {});
        const allAttrs = [...new Set([...previewAttrs, ...dataAttrs])];
        const credentialAttrs = allAttrs.map(norm);
        const rawRequiredAttributes = getRequiredAttributes(request);
        const requiredAttributeValues = getRequiredAttributeValues(request);
        const valueRestrictedAttributes = Array.from(
          new Set(
            Object.keys(requiredAttributeValues)
              .map((attr) => attr.trim())
              .filter((attr) => attr.length > 0),
          ),
        );
        const requiredAttrs = rawRequiredAttributes.map(norm);
        const missingAttrs = requiredAttrs.filter(attr => !credentialAttrs.includes(attr));

        console.log('Detailed', {
          credential_preview_keys: previewAttrs,
          credential_data_keys: dataAttrs,
          combined_attrs: allAttrs,
          normalized_credential_attrs: credentialAttrs,
          normalized_required_attrs: requiredAttrs,
          missing_attrs: missingAttrs,
          required_attributes_raw: request['required_attributes'],
          match_result: missingAttrs.length === 0 ? 'Match' : 'Mismatch',
        });

        const failureContextBase = {
          credential_type: credential?.credential_type || 'Unknown Credential',
          credential_id:
            credential?.id ||
            (credential as { credential_id?: string } | null)?.credential_id ||
            'unknown',
          verifier_name: getStringProperty(request, 'verifier_name') || 'Verifier',
          verifier_did: getStringProperty(request, 'verifier_did') || undefined,
          failed_at: new Date().toISOString(),
        };

        if (missingAttrs.length > 0) {
          console.log('Missing required attributes:', missingAttrs);

          try {
            const requestId = getRequestIdFromRequest(request);

            if (!requestId) {
              console.warn('Cannot reject: request has no ID');
              return;
            }

            const response = await fetch(
              `${API_URL}/api/wallet/presentation-requests/${requestId}/reject`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  holder_did,
                  reason: `Credential does not contain required attributes: ${missingAttrs.join(', ')}`,
                  error_code: 'MISSING_REQUIRED_ATTRIBUTES',
                  details: {
                    missing_attributes: missingAttrs,
                  },
                }),
              },
            );

            const rejectionResult = await response.json();

            if (!response.ok) {
              console.warn('Rejection response not ok:', rejectionResult);
            }

            console.log('Rejection sent to verifier', rejectionResult);

            clearInterval(pollInterval);

            const failurePayload = buildFailureData(
              failureContextBase,
              {
                reason: rejectionResult.reason,
                error_code: rejectionResult.error_code,
                details: rejectionResult.details,
              },
              `Credential is missing required attributes: ${missingAttrs.join(', ')}`,
            );

            storeVerificationFailure({
              ...failurePayload,
              details: failurePayload.details ?? {
                missing_attributes: missingAttrs,
              },
            });

            sessionStorage.removeItem('verifier_requirements');

            router.push('/VerificationFailure');
          } catch (error) {
            console.error('Failed to send rejection:', error);
          }

          return;
        }

        const normalizedCredentialValues: Record<string, { raw: string; normalized: string }> = {};

        const collectValues = (source?: Record<string, unknown>, isPreview = false) => {
          if (!source || typeof source !== 'object') return;
          for (const [key, rawValue] of Object.entries(source)) {
            if (!key || typeof key !== 'string') continue;

            const normalizedKey = key.trim().toLowerCase();
            if (!normalizedKey) continue;

            const valueString =
              typeof rawValue === 'string'
                ? rawValue
                : rawValue == null
                  ? ''
                  : JSON.stringify(rawValue);

            const trimmed = valueString.trim();
            if (!trimmed) continue;

            if (!normalizedCredentialValues[normalizedKey] || isPreview) {
              normalizedCredentialValues[normalizedKey] = {
                raw: valueString,
                normalized: trimmed.toLowerCase(),
              };
            }
          }
        };

        collectValues(credential?.credential_data);
        collectValues(credential?.credential_preview, true);

        const mismatchedValues: Array<{ attribute: string; actual: string; accepted: string[] }> = [];

        Object.entries(requiredAttributeValues).forEach(([attribute, allowedValues]) => {
          const normalizedAttrKey = attribute.trim().toLowerCase();
          if (!normalizedAttrKey) return;

          if (allowedValues.length === 0) {
            if (!normalizedCredentialValues[normalizedAttrKey]) {
              mismatchedValues.push({
                attribute,
                actual: 'not provided',
                accepted: [],
              });
            }
            return;
          }

          const actual = normalizedCredentialValues[normalizedAttrKey];
          if (!actual) {
            mismatchedValues.push({
              attribute,
              actual: 'not provided',
              accepted: allowedValues,
            });
            return;
          }

          const isMatch = allowedValues.some((candidate) => {
            const trimmedCandidate = candidate.trim();
            if (!trimmedCandidate) return false;
            return (
              trimmedCandidate.toLowerCase() === actual.normalized ||
              trimmedCandidate.localeCompare(actual.raw, undefined, { sensitivity: 'accent' }) === 0
            );
          });

          if (!isMatch) {
            mismatchedValues.push({
              attribute,
              actual: actual.raw,
              accepted: allowedValues,
            });
          }
        });

        if (mismatchedValues.length > 0) {
          console.log('Attribute values do not meet verifier requirements:', mismatchedValues);

          try {
            const requestId = getRequestIdFromRequest(request);
            if (!requestId) {
              console.warn('Cannot reject: request has no ID (value mismatch)');
              return;
            }

            const serverReasonParts = mismatchedValues.map((entry) => {
              if (entry.accepted.length === 0) {
                return `Attribute '${entry.attribute}' was not provided.`;
              }
              const allowedList = entry.accepted.join(', ');
              return `Attribute '${entry.attribute}' value '${entry.actual}' is outside the verifier policy (allowed: ${allowedList}).`;
            });

            const userReasonParts = mismatchedValues.map((entry) => {
              if (entry.accepted.length === 0) {
                return `Attribute '${entry.attribute}' is required but missing.`;
              }
              return `Attribute '${entry.attribute}' does not meet the verifier's policy.`;
            });

            const sanitizedMismatches = mismatchedValues.map((entry) => ({
              attribute: entry.attribute,
              actual: entry.actual === 'not provided' ? undefined : entry.actual,
              status: entry.accepted.length === 0 ? 'missing' : 'value_mismatch',
            }));

            const response = await fetch(
              `${API_URL}/api/wallet/presentation-requests/${requestId}/reject`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  holder_did,
                  reason: serverReasonParts.join('; '),
                  error_code: 'ATTRIBUTE_VALUE_MISMATCH',
                  details: {
                    attribute_value_mismatches: sanitizedMismatches,
                  },
                }),
              },
            );

            const rejectionResult = await response.json();

            if (!response.ok) {
              console.warn('Value-mismatch rejection failed:', rejectionResult);
            }

            console.log('Value-mismatch rejection sent to verifier', rejectionResult);

            clearInterval(pollInterval);

            const friendlyReason = userReasonParts.join(' ');

            const failurePayload = buildFailureData(
              failureContextBase,
              {
                reason: friendlyReason || rejectionResult.reason,
                error_code: rejectionResult.error_code,
                details: rejectionResult.details,
              },
              friendlyReason,
            );

            storeVerificationFailure({
              ...failurePayload,
              details: failurePayload.details ?? {
                attribute_value_mismatches: sanitizedMismatches,
              },
            });

            sessionStorage.removeItem('verifier_requirements');

            router.push('/VerificationFailure');
          } catch (error) {
            console.error('Failed to send value-mismatch rejection:', error);
          }

          return;
        }

        console.log('All required attributes present');

        const resolvedRequestId = getRequestIdFromRequest(request) || requestIdFromSession || requestPresentationId || activePresentationId || null;

        sessionStorage.setItem('verifier_requirements', JSON.stringify({
          request_id: resolvedRequestId,
          verifier_did: getStringProperty(request, 'verifier_did'),
          verifier_name: getStringProperty(request, 'verifier_name'),
          purpose: getStringProperty(request, 'purpose'),
          required_predicates: getRequiredPredicates(request),
          mandatory_attributes: rawRequiredAttributes,
          optional_attributes: getOptionalAttributes(request),
          value_restricted_attributes: valueRestrictedAttributes,
          presentation_id: requestPresentationId || activePresentationId || null,
        }));

        // Persist full presentation request for downstream AttributeConsent/Confirmation
        sessionStorage.setItem('presentation_request', JSON.stringify(request));
        if (resolvedRequestId) {
          sessionStorage.setItem('presentation_request_id', String(resolvedRequestId));
        }

        console.log('Redirecting to AttributeConsent');

        clearInterval(pollInterval);
        router.push('/AttributeConsent');
      } catch (error) {
        console.error('Error:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [holder_did, qrData, router, credential]);

  if (!mounted || !credential) {
    return (
      <div className="min-h-screen bg-light-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-dark-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-50">
      {/* Header */}
      <div className="bg-light-50 backdrop-blur-sm px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center">
          <button 
            onClick={() => router.push('/ShareCredentials')} 
            className="mr-3 p-2 hover:bg-light-50 rounded-full transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-medium text-dark-500">Present Credential</h1>
            <p className="text-xs text-dark-300">{credential.credential_type}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 pb-20 space-y-6">
        {/* QR Code Section */}
        <div className="bg-white">
          {/* Timer Bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={18} className={expiresIn <= 10 ? 'text-red-500 animate-pulse' : 'text-primary-500'} />
              <span className={`text-sm font-medium ${expiresIn <= 10 ? 'text-red-500' : 'text-dark-500'}`}>
                Expires in {expiresIn}s
              </span>
            </div>
            
            <button
              onClick={generateQRCode}
              disabled={isGenerating}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-100 hover:bg-primary-200 text-primary-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={isGenerating ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-6 h-2 bg-light-50 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ease-linear ${
                expiresIn <= 10 ? 'bg-red-500' : 'bg-primary-500'
              }`}
              style={{ width: `${(expiresIn / 30) * 100}%` }}
            />
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            {qrData ? (
              <div className="p-4 bg-light-50 rounded-2xl shadow-inner border-2 border-primary-100">
                <QRCodeSVG
                  value={qrData}
                  size={320}
                  level="H"
                  includeMargin={false}
                  style={{
                    height: 'auto',
                    maxWidth: '100%',
                    width: '320px',
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-80 h-80 bg-light-50 rounded-2xl">
                <div className="text-center">
                  <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                  <p className="text-sm text-dark-300">Generating QR...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Credential Info */}
        <div className="bg-white">
          <h3 className="text-sm font-medium text-dark-400 mb-3 uppercase tracking-wide">Credential Details</h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-dark-400">Type:</span>
              <span className="text-sm font-medium text-dark-500">{credential.credential_type}</span>
            </div>

            {credential.issuer_name && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-400">Issuer:</span>
                <span className="text-sm font-medium text-dark-500">{credential.issuer_name}</span>
              </div>
            )}

            {credential.issuedDate && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-400">Issued:</span>
                <span className="text-sm font-medium text-dark-500">
                  {new Date(credential.issuedDate).toLocaleDateString()}
                </span>
              </div>
            )}

            {credential.status && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-400">Status:</span>
                <span className={`text-xs px-2 py-1 rounded-md font-medium ${
                  credential.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {credential.status}
                </span>
              </div>
            )}

            {credential.credential_preview && (
              <div className="pt-2 border-t border-dark-100">
                <span className="text-sm text-dark-400 mb-2 block">Attributes:</span>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(credential.credential_preview).map((key, index) => (
                    <span key={index} className="text-xs px-2 py-1 bg-primary-50 text-primary-700 rounded">
                      {key.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
