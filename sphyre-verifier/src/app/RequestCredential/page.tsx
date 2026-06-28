'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, ChevronLeft, Copy, Check, Loader2 } from 'lucide-react';
import QRCode from 'react-qr-code';
import dynamic from 'next/dynamic';

const VerificationRequestForm = dynamic(() =>
  import('../../components/VerificationRequestForm').then((mod) => mod.default),
{ ssr: false }
);

interface VerifierInfo {
  id?: string;
  name?: string;
  organization?: string;
  domain?: string;
}

export default function RequestCredentialPage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

interface VerifierFailurePayload {
  reason?: string;
  error_code?: string | null;
  details?: unknown;
  presentation_data?: unknown;
  updated_at?: string;
  holder_label?: string;
}
  const [step, setStep] = useState<'form' | 'qr'>('form');
  const [qrData, setQrData] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [verifierInfo, setVerifierInfo] = useState<VerifierInfo | null>(null);
  const [waitingRequestId, setWaitingRequestId] = useState<string | null>(null);
  const [waitingHolderLabel, setWaitingHolderLabel] = useState<string | null>(null);
  const [waitingStatus, setWaitingStatus] = useState<'pending' | 'approved' | 'rejected' | 'expired' | null>(null);
  const [waitingError, setWaitingError] = useState<string | null>(null);
  const [statusPollCount, setStatusPollCount] = useState(0);
  const [isResolvingRequest, setIsResolvingRequest] = useState(false);

  // Form state
  const [requestType, setRequestType] = useState('');
  const [purpose, setPurpose] = useState('');
  const [requiredAttributes, setRequiredAttributes] = useState<string[]>([]);
  const [attributeValueRequirements, setAttributeValueRequirements] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const verifierDID = localStorage.getItem('verifierDID');
    const storedInfo = localStorage.getItem('verifierInfo');
    
    if (!verifierDID) {
      console.error('No verifier DID found. Please complete onboarding.');
      router.push('/onboarding');
      return;
    }
    
    if (storedInfo) {
      try {
        const info = JSON.parse(storedInfo);
        setVerifierInfo(info);
        console.log('Verifier info loaded:', info);
      } catch (error) {
        console.error('Failed to parse verifier info:', error);
        // Use DID as fallback
        setVerifierInfo({ id: verifierDID, name: 'Verifier' });
      }
    } else {
      // Use DID as fallback if no stored info
      setVerifierInfo({ id: verifierDID, name: 'Verifier' });
    }
  }, [router]);
  
  // Get verifier DID and name from state
  const verifierDID = verifierInfo?.id || '';
  const verifierName = verifierInfo?.name || verifierInfo?.organization || 'Verifier';

  interface PredicateRequirement {
    attribute: string;
    operator: string;
    value: number;
    predicate_type: string;
  }

  const [presets, setPresets] = useState<Array<{
    id: string;
    name: string;
    preset_type: string;
    default_purpose: string;
    required_predicates?: PredicateRequirement[];
    required_attributes: string[];
    requested_attributes?: string[];
  }>>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<typeof presets[0] | null>(null);

  // Fetch presets from backend
  useEffect(() => {
    if (verifierDID && !presetsLoaded) {
      fetchPresets();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifierDID, presetsLoaded]);

  const fetchPresets = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech'}/api/verifier/${verifierDID}/presets`);
      const data = await response.json();
      
      if (data.success && data.presets) {
        setPresets(data.presets);
        console.log('Loaded', data.presets.length, 'presets from backend');
      } else {
        console.warn('Failed to load presets, using fallback');
        setPresets([
          {
            id: 'fallback_age',
            name: 'Age Verification',
            preset_type: 'age_verification',
            default_purpose: 'Age verification for service access',
            required_attributes: ['age_over_21', 'date_of_birth'],
          },
        ]);
      }
    } catch (error) {
      console.error('Error loading presets:', error);
      // Use fallback presets on error
      setPresets([
        {
          id: 'fallback_age',
          name: 'Age Verification',
          preset_type: 'age_verification',
          default_purpose: 'Age verification for service access',
          required_attributes: ['age_over_21', 'date_of_birth'],
        },
      ]);
    } finally {
      setPresetsLoaded(true);
    }
  };

  const resolveRequestFromQr = useCallback(
    async (qrValue: string) => {
      if (!qrValue) return;

      try {
        setIsResolvingRequest(true);
        setWaitingError(null);

        let requestId: string | undefined;
        let holderLabel: string | undefined;

        const extractRequestPayload = (payload: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
          if (!payload) return undefined;
          if ('content' in payload && typeof payload.content === 'object' && payload.content !== null) {
            const content = payload.content as Record<string, unknown>;
            if (typeof content.data === 'object' && content.data !== null) {
              return content.data as Record<string, unknown>;
            }
          }
          if ('data' in payload && typeof payload.data === 'object' && payload.data !== null) {
            return payload.data as Record<string, unknown>;
          }
          return payload;
        };

        if (qrValue.startsWith('http://') || qrValue.startsWith('https://')) {
          const parsed = new URL(qrValue);
          const segments = parsed.pathname.split('/').filter(Boolean);
          const shortId = segments.pop();

          if (shortId) {
            const resolveResp = await fetch(`${API_URL}/api/qr/resolve/${shortId}`);
            if (!resolveResp.ok) {
              throw new Error(`Failed to resolve QR (HTTP ${resolveResp.status})`);
            }

            const resolvedJson = await resolveResp.json();
            const resolvedData = extractRequestPayload(resolvedJson.data || resolvedJson);

            if (resolvedData) {
              requestId = (resolvedData.request_id as string) || (resolvedData.requestId as string) || (resolvedData.id as string);
              const resolvedHolderDid = (resolvedData.holder_did as string) || (resolvedData.holderDid as string) || undefined;
              const resolvedPseudonym = (resolvedData.holder_pseudonym as string) || (resolvedData.holderPseudonym as string) || undefined;
              holderLabel = resolvedPseudonym || resolvedHolderDid;
            }
          }
        } else {
          try {
            const parsed = JSON.parse(qrValue) as Record<string, unknown>;
            const payload = extractRequestPayload(parsed);
            if (payload) {
              requestId = (payload.request_id as string) || (payload.requestId as string) || (payload.id as string);
              const resolvedHolderDid = (payload.holder_did as string) || (payload.holderDid as string) || undefined;
              const resolvedPseudonym = (payload.holder_pseudonym as string) || (payload.holderPseudonym as string) || undefined;
              holderLabel = resolvedPseudonym || resolvedHolderDid;
            }
          } catch (error) {
            console.warn('QR payload is not a JSON presentation request:', error);
          }
        }

        if (requestId) {
          setWaitingRequestId(requestId);
          setWaitingStatus('pending');
          if (holderLabel) {
            setWaitingHolderLabel(holderLabel);
          }
          sessionStorage.setItem('verifier_active_request_id', requestId);
          if (holderLabel) {
            sessionStorage.setItem('verifier_active_holder_label', holderLabel);
          }
        } else {
          setWaitingError('Failed to extract request ID from QR.');
        }
      } catch (error) {
        console.error('Failed to extract request ID from QR:', error);
        setWaitingError(error instanceof Error ? error.message : 'Failed to extract request ID from QR.');
      } finally {
        setIsResolvingRequest(false);
      }
    },
    [API_URL]
  );

  useEffect(() => {
    if (!waitingRequestId) {
      return;
    }

    setStatusPollCount(0);
    setWaitingError(null);

    let isActive = true;

    const pollStatus = async () => {
      try {
        setStatusPollCount((prev) => prev + 1);
        const response = await fetch(
          `${API_URL}/api/wallet/presentation-requests/${waitingRequestId}/status`
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }

        const data = await response.json();
        if (!isActive) {
          return;
        }

        const status = (data.status as string | undefined) || 'pending';
        if (status !== waitingStatus) {
          setWaitingStatus(status as typeof waitingStatus);
        }

        if (status === 'approved') {
          if (data.presentation_data) {
            sessionStorage.setItem('presentation_data', JSON.stringify(data.presentation_data));
          }
          const holderFromResponse =
            data.holder_pseudonym ||
            data.request?.holder_pseudonym ||
            data.request?.holder_did ||
            sessionStorage.getItem('verifier_active_holder_label') ||
            undefined;
          if (holderFromResponse) {
            sessionStorage.setItem('verifier_active_holder_label', holderFromResponse);
          }
          const params = new URLSearchParams({ requestId: waitingRequestId });
          if (holderFromResponse) {
            params.set('holderPseudonym', holderFromResponse);
          }
          router.push(`/WaitingForHolder?${params.toString()}`);
          return;
        }

        if (status === 'rejected') {
          const reason = data.rejection_reason || 'Holder rejected the verification request';
          const failurePayload = {
            reason,
            error_code: data.failure_code ?? null,
            details: data.failure_details ?? null,
            presentation_data: data.presentation_data ?? null,
            updated_at: data.updated_at,
            holder_label:
              data.holder_pseudonym ||
              data.request?.holder_pseudonym ||
              data.request?.holder_did ||
              sessionStorage.getItem('verifier_active_holder_label') ||
              undefined,
          } satisfies VerifierFailurePayload;

          try {
            sessionStorage.setItem('verifier_verification_failure', JSON.stringify(failurePayload));
          } catch (error) {
            console.warn('Failed to persist verifier failure payload:', error);
          }

          router.push(`/VerificationRejected?reason=${encodeURIComponent(reason)}`);
          return;
        }

        if (status === 'expired') {
          const reason = 'Request expired (5 minute timeout)';
          const failurePayload = {
            reason,
            error_code: 'REQUEST_EXPIRED',
            details: {
              request_id: waitingRequestId,
            },
            presentation_data: data.presentation_data ?? null,
            updated_at: data.updated_at,
            holder_label:
              data.holder_pseudonym ||
              data.request?.holder_pseudonym ||
              data.request?.holder_did ||
              sessionStorage.getItem('verifier_active_holder_label') ||
              undefined,
          } satisfies VerifierFailurePayload;

          try {
            sessionStorage.setItem('verifier_verification_failure', JSON.stringify(failurePayload));
          } catch (error) {
            console.warn('Failed to persist verifier failure payload:', error);
          }

          router.push('/VerificationRejected?reason=Request%20expired%20(5%20minute%20timeout)');
        }
      } catch (error) {
        if (!isActive) {
          return;
        }
        console.error('Failed:', error);
        setWaitingError(error instanceof Error ? error.message : 'Failed');
      }
    };

    const intervalId = setInterval(pollStatus, 2000);
    pollStatus();

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [API_URL, waitingRequestId, router]);

  // Auto-select first preset after loading
  useEffect(() => {
    if (presetsLoaded && presets.length > 0 && !requestType) {
      const firstPreset = presets[0];
      setRequestType(firstPreset.preset_type);
      setPurpose(firstPreset.default_purpose);
      setRequiredAttributes(firstPreset.required_attributes);
      setAttributeValueRequirements({});
      console.log('Auto-selected first preset:', firstPreset.name);
    }
  }, [presetsLoaded, presets, requestType]);

  const handleRequestTypeChange = (type: string) => {
    setRequestType(type);
    const preset = presets.find(p => p.preset_type === type || p.id === type);
    if (preset) {
      setSelectedPreset(preset);
      setPurpose(preset.default_purpose);
      setRequiredAttributes(preset.required_attributes);
      setAttributeValueRequirements({});
    }
  };

  const handleVerificationFormSubmit = useCallback((values: {
    requiredAttributes: string[];
    attributeValueRequirements: Record<string, string[]>;
  }) => {
    setRequiredAttributes(values.requiredAttributes);
    setAttributeValueRequirements(values.attributeValueRequirements);
  }, []);

  const handleGenerateQR = async () => {
    try {
      if (!verifierDID || !verifierName) {
        alert('Verifier information not loaded. Please refresh the page or complete onboarding.');
        return;
      }

      // Validate required attributes
      if (!requiredAttributes || requiredAttributes.length === 0) {
        alert('Please select at least one required attribute.');
        return;
      }

      console.log('Generating QR code..');

      const requiredCredentials = requiredAttributes.map(attr => ({
        credential_type: requestType || selectedPreset?.preset_type || 'VerifiableCredential',
        required_attributes: [attr],
        issuer_did: null,
      }));

      // Extract predicates from preset
      const predicates = selectedPreset?.required_predicates || [];
      
      console.log('Required credentials:', requiredCredentials);
      console.log('Predicates from preset:', predicates);

      const response = await fetch(`${API_URL}/api/verifier/qr/presentation-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Verifier-DID': verifierDID,
        },
        body: JSON.stringify({
          verifier_did: verifierDID,
          required_credentials: requiredCredentials,
          presentation_type: requestType || selectedPreset?.preset_type || 'presentation_request',
          purpose: purpose,
          callback_url: `${API_URL}/api/verifier/presentations`,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          required_attribute_values: attributeValueRequirements,
          required_predicates: predicates.length > 0 ? predicates : undefined,
        }),
        credentials: 'omit',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to generate QR: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success || !data.qr_data) {
        throw new Error('Invalid response from backend: missing qr_data');
      }

      console.log('QR generated successfully from backend');
      console.log('QR Data:', data.qr_data);

      setQrData(data.qr_data);
      setStep('qr');
      resolveRequestFromQr(data.qr_data);

    } catch (error) {
      console.error('Error generating QR code:', error);
      alert(`Failed to generate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCopyRequest = () => {
    if (qrData) {
      navigator.clipboard.writeText(qrData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBack = () => {
    if (step === 'qr') {
      setStep('form');
    } else {
      router.push('/VerifierHome');
    }
  };

  if (!verifierInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading verifier information</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-50 to-purple-50">
      {/* Header */}
      <div className="bg-light-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-dark-300 hover:text-dark-500 transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="font-medium">Back</span>
          </button>
          <h1 className="text-xl font-bold text-dark-500">Request Credential</h1>
          <div className="w-20"></div>
        </div>
      </div>
      
      {/* Verifier Info Banner */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">
              Creating request as: <strong>{verifierName}</strong>
            </p>
            <p className="text-xs text-blue-700 mt-0.5 font-mono truncate">
              {verifierDID}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {step === 'form' ? (
          <div className="bg-white rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <QrCode className="w-6 h-6 text-primary-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-dark-500">Create Credential Request</h2>
                <p className="text-sm text-dark-300">Generate a QR code for holders to scan</p>
              </div>
            </div>

            {/* Request Type Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-dark-500 mb-2">
                Request Type
              </label>
              <select
                value={requestType}
                onChange={(e) => handleRequestTypeChange(e.target.value)}
                className="w-full px-4 py-3 border border-dark-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select a request type...</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.preset_type}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Purpose */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-dark-500 mb-2">
                Purpose
              </label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-4 py-3 border border-dark-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter the purpose of this request"
              />
            </div>

            {/* Required Attributes */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-dark-500 mb-2">
                Required Attributes
              </label>
              <VerificationRequestForm
                onSubmit={handleVerificationFormSubmit}
                initialValues={{
                  requiredAttributes,
                  attributeValueRequirements,
                }}
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateQR}
              className="w-full bg-primary-500 text-white py-4 rounded-full font-medium text-lg hover:bg-primary-600 transition-colors flex items-center justify-center gap-2"
            >
              <QrCode size={20} />
              Generate QR Code
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-dark-500 mb-2">
                QR Code Generated!
              </h2>
              <p className="text-dark-300">
                Show this QR code to the credential holder to scan
              </p>
            </div>

            {/* QR Code Display */}
            <div className="flex justify-center mb-8">
              <div className="bg-white p-6 rounded-2xl border-4 border-dark-100">
                {qrData && (
                  <QRCode
                    value={qrData}
                    size={256}
                    level="M"
                  />
                )}
              </div>
            </div>

            {/* Request Details */}
            <div className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-200">
              <h3 className="font-medium text-blue-900 mb-2">Request Details:</h3>
              <div className="space-y-1 text-sm text-blue-800">
                <p><strong>Purpose:</strong> {purpose}</p>
                <p><strong>Required Attributes:</strong> {requiredAttributes.join(', ')}</p>
              </div>
            </div>

            {/* Status Monitor */}
            {(isResolvingRequest || waitingRequestId) && (
              <div className="bg-white border border-blue-200 rounded-xl p-4 mb-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-blue-900">Verification Status</p>
                    {waitingRequestId && (
                      <p className="text-xs font-mono text-blue-700 mt-1">
                        Request ID: {waitingRequestId.length > 24 ? `${waitingRequestId.slice(0, 24)}...` : waitingRequestId}
                      </p>
                    )}
                    {waitingHolderLabel && (
                      <p className="text-xs text-blue-600 break-all mt-1">Holder: {waitingHolderLabel}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!waitingRequestId}
                    onClick={() => {
                      if (waitingRequestId) {
                        const params = new URLSearchParams({ requestId: waitingRequestId });
                        if (waitingHolderLabel) {
                          params.set('holderPseudonym', waitingHolderLabel);
                        }
                        router.push(`/WaitingForHolder?${params.toString()}`);
                      }
                    }}
                    className={`text-xs font-medium rounded-full px-3 py-1 transition ${
                      waitingRequestId
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Open status view
                  </button>
                </div>

                <div className="mt-3 text-sm text-blue-800 flex items-center gap-2">
                  {isResolvingRequest ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span>Resolving request information…</span>
                    </>
                  ) : waitingStatus === 'approved' ? (
                    <span className="text-green-600 font-medium">Approved · redirecting…</span>
                  ) : waitingStatus === 'rejected' ? (
                    <span className="text-red-600 font-medium">Rejected · redirecting…</span>
                  ) : waitingStatus === 'expired' ? (
                    <span className="text-amber-600 font-medium">Expired · redirecting…</span>
                  ) : waitingRequestId ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span>Waiting for holder response…</span>
                    </>
                  ) : (
                    <span className="text-slate-600">Waiting for QR scan…</span>
                  )}
                </div>

                {waitingRequestId && (
                  <p className="mt-2 text-xs text-blue-500">Polling attempt #{statusPollCount}</p>
                )}

                {waitingError && (
                  <p className="mt-2 text-xs text-red-600">{waitingError}</p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={handleCopyRequest}
                className="w-full bg-light-200 text-dark-500 py-3 rounded-full font-medium hover:bg-light-200 transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check size={18} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={18} />
                    Copy Request Data
                  </>
                )}
              </button>
              <button
                onClick={() => setStep('form')}
                className="w-full text-dark-300 py-3 font-medium hover:bg-light-200 transition-colors rounded-full"
              >
                Create Another Request
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
