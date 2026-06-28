'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ChevronLeft, Check, QrCode } from 'lucide-react';
import apiService from '@/services/apiService';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

const QrScanner = dynamic(() => import('@yudiel/react-qr-scanner').then(mod => mod.QrScanner), {
  ssr: false,
});

interface PredicateRequirement {
  attribute: string;
  operator: string;
  value: number;
  predicate_type?: string;
}

interface VerificationPreset {
  id: string;
  name: string;
  description: string;
  preset_type: string;
  default_purpose?: string;
  required_predicates?: PredicateRequirement[];
  required_attributes: string[];
  requested_attributes?: string[];
  is_system: boolean;
}

const ScanPage: React.FC = () => {
  const router = useRouter();
  const [step, setStep] = useState<'select' | 'scan' | 'verify'>('select');
  const [verifierDID, setVerifierDID] = useState('');
  const [verifierName, setVerifierName] = useState('');
  
  // Preset selection
  const [presets, setPresets] = useState<VerificationPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<VerificationPreset | null>(null);
  const [purpose, setPurpose] = useState('');
  const [attributeValueRequirements, setAttributeValueRequirements] = useState<Record<string, string[]>>({});
  
  // Scanning state
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load verifier info
  useEffect(() => {
    const did = localStorage.getItem('verifierDID');
    const info = localStorage.getItem('verifierInfo');
    
    if (!did) {
      router.push('/onboarding');
      return;
    }
    
    setVerifierDID(did);
    
    if (info) {
      try {
        const parsed = JSON.parse(info);
        const derivedName =
          (typeof parsed.name === 'string' && parsed.name.trim().length > 0 && parsed.name.trim()) ||
          (typeof parsed.organization === 'string' && parsed.organization.trim().length > 0 && parsed.organization.trim()) ||
          '';
        setVerifierName(derivedName);
      } catch {
        setVerifierName('');
      }
    }
  }, [router]);

  // Fetch presets
  useEffect(() => {
    if (verifierDID && presets.length === 0) {
      fetchPresets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifierDID]);

  const fetchPresets = async () => {
    try {
      const response = await apiService.listPresets(verifierDID);
      if (response.success && response.data) {
        const data = response.data as { presets: VerificationPreset[] };
        setPresets(data.presets || []);
      }
    } catch (error) {
      console.error('Failed to fetch presets:', error);
      // Fallback presets
      setPresets([
        {
          id: 'fallback_age',
          name: 'Age Verification',
          description: 'Verify age is over 21',
          preset_type: 'age_verification',
          default_purpose: 'Age verification for service access',
          required_attributes: ['age_over_21', 'date_of_birth'],
          is_system: true,
        },
      ]);
    }
  };

  // Handle preset selection
  const handleSelectPreset = (preset: VerificationPreset) => {
    setSelectedPreset(preset);
    setPurpose(preset.default_purpose || '');
    setAttributeValueRequirements({});
  };

  // Start scanning
  const handleStartScan = () => {
    if (!selectedPreset) {
      alert('Please select a verification type first');
      return;
    }
    if (!purpose.trim()) {
      alert('Please enter a purpose for verification');
      return;
    }
    setStep('scan');
    setScanning(true);
  };

  // Verify credential against selected preset
  const handleAddAttributeValue = useCallback((attribute: string) => {
    const input = prompt(`Enter an allowed value for the "${attribute}" attribute`);
    if (!input) return;
    const normalized = input.trim();
    if (!normalized) return;

    setAttributeValueRequirements((prev) => {
      const existing = prev[attribute] || [];
      if (existing.some((value) => value.trim().toLowerCase() === normalized.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        [attribute]: [...existing, normalized],
      };
    });
  }, []);

  const handleRemoveAttributeValue = useCallback((attribute: string, value: string) => {
    setAttributeValueRequirements((prev) => {
      const existing = prev[attribute] || [];
      const filtered = existing.filter((item) => item !== value);
      if (filtered.length === 0) {
        const { [attribute]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [attribute]: filtered,
      };
    });
  }, []);

  const verifyCredential = useCallback((credential: Record<string, unknown>) => {
    setStep('verify');

    if (!selectedPreset) {
      setError('No verification preset selected');
      return;
    }

    // Extract credential attributes
    const credentialSubject = credential.credentialSubject || {};
    const attributes = Object.keys(credentialSubject);
    
    // Check if credential contains required attributes
    const missingAttributes = selectedPreset.required_attributes.filter(
      required => !attributes.includes(required)
    );

    if (missingAttributes.length > 0) {
      setError(`Missing required attributes: ${missingAttributes.join(', ')}`);
      setSuccess(null);
      return;
    }

    const filteredValuePolicies: Record<string, string[]> = Object.fromEntries(
      Object.entries(attributeValueRequirements)
        .filter(([, values]) => Array.isArray(values) && values.length > 0)
        .map(([attribute, values]) => [
          attribute,
          values.filter((value: string) => value.trim().length > 0),
        ])
        .filter(([, values]) => values.length > 0)
    );

    if (Object.keys(filteredValuePolicies).length > 0) {
      const subjectValueMap = new Map<string, { raw: string; normalized: string }>();

      Object.entries(credentialSubject as Record<string, unknown>).forEach(([key, value]) => {
        const normalizedKey = key.trim().toLowerCase();
        const rawString =
          typeof value === 'string'
            ? value
            : value === null || value === undefined
              ? ''
              : String(value);
        subjectValueMap.set(normalizedKey, {
          raw: rawString,
          normalized: rawString.trim().toLowerCase(),
        });
      });

      const mismatchMessages: string[] = [];

      Object.entries(filteredValuePolicies).forEach(([attribute, allowedValues]) => {
        const normalizedAttribute = attribute.trim().toLowerCase();
        const subjectEntry = subjectValueMap.get(normalizedAttribute);

        const allowedNormalized = allowedValues
          .map((value: string) => value.trim())
          .filter((value: string) => Boolean(value))
          .map((value: string) => value.toLowerCase());

        if (!subjectEntry) {
          mismatchMessages.push(`The attribute '${attribute}' was not found on the credential.`);
          return;
        }

        if (!allowedNormalized.some((value) => value === subjectEntry.normalized)) {
          mismatchMessages.push(
            `The value for attribute '${attribute}' does not satisfy the verification policy.`
          );
        }
      });

      if (mismatchMessages.length > 0) {
        setError(mismatchMessages.join(' '));
        setSuccess(null);
        return;
      }
    }

    const hasValuePolicies = Object.keys(filteredValuePolicies).length > 0;

    setSuccess(
      hasValuePolicies
        ? 'Credential verified successfully. Attribute values satisfy policy.'
        : 'Credential verified successfully! All required attributes present.'
    );
    setError(null);

    // Store verification result
    sessionStorage.setItem('verification_result', JSON.stringify({
      credential,
      preset: selectedPreset,
      purpose,
      verified_at: new Date().toISOString(),
      status: 'verified',
      attribute_value_requirements: filteredValuePolicies,
    }));
  }, [selectedPreset, purpose, attributeValueRequirements]);

  // Handle QR scan result
  const handleScan = useCallback((result: string) => {
    if (result && scanning) {
      setScanning(false);
      try {
        const data = JSON.parse(result) as Record<string, unknown>;
        console.log('Scanned QR:', data);
        
        // Check if this is a credential presentation
        if (data.type === 'credential_presentation') {
          const holderPseudonym =
            typeof (data as { holder_pseudonym?: unknown }).holder_pseudonym === 'string'
              ? ((data as { holder_pseudonym: string }).holder_pseudonym.trim() || undefined)
              : undefined;
          const holderDID =
            typeof (data as { holder_did?: unknown }).holder_did === 'string'
              ? ((data as { holder_did: string }).holder_did.trim() || undefined)
              : undefined;
          const credentialID =
            typeof (data as { credential_id?: unknown }).credential_id === 'string'
              ? ((data as { credential_id: string }).credential_id.trim() || undefined)
              : undefined;
          const presentationId =
            typeof (data as { presentation_id?: unknown }).presentation_id === 'string'
              ? (data as { presentation_id: string }).presentation_id
              : typeof (data as { presentationId?: unknown }).presentationId === 'string'
                ? (data as { presentationId: string }).presentationId
              : undefined;

          if (!holderDID && !holderPseudonym) {
            setError('QR code is missing holder information.');
            setTimeout(() => {
              setError(null);
              setStep('select');
            }, 3000);
            return;
          }

          if (!selectedPreset) {
            setError('Please select a verification type first');
            setTimeout(() => {
              setError(null);
              setStep('select');
            }, 2000);
            return;
          }
          
          // Get verifier DID from localStorage
          const verifierDID = localStorage.getItem('verifierDID') || 'did:alyra:verifier:demo';
          
          console.log('Creating presentation request:', {
            verifier_did: verifierDID,
            holder_identifier: holderDID || holderPseudonym,
            credential_id: credentialID,
            preset: selectedPreset.name,
          });
          
          const filteredValuePolicies = Object.fromEntries(
            Object.entries(attributeValueRequirements)
              .filter(([, values]) => Array.isArray(values) && values.length > 0)
              .map(([attribute, values]) => [attribute, values.filter((value) => value.trim().length > 0)])
              .filter(([, values]) => values.length > 0)
          );

          const displayName =
            (verifierName && verifierName.trim()) ||
            (verifierDID ? verifierDID.split(':').pop() : '') ||
            'Verifier';

          const requestPayload: Record<string, unknown> = {
            verifier_did: verifierDID,
            verifier_name: displayName,
            purpose: purpose || selectedPreset.default_purpose || 'Verification',
            requiredPredicates: selectedPreset.required_predicates || [],
            required_attributes: selectedPreset.required_attributes,
            requested_attributes: selectedPreset.requested_attributes || [],
            presentation_id: presentationId,
          };

          if (holderDID) {
            requestPayload.holder_did = holderDID;
          } else if (holderPseudonym) {
            requestPayload.holder_pseudonym = holderPseudonym;
          }

          if (credentialID) {
            requestPayload.credential_id = credentialID;
          }

          if (Object.keys(filteredValuePolicies).length > 0) {
            requestPayload.required_attribute_values = filteredValuePolicies;
          }

          // Create presentation request in backend
          fetch(`${API_URL}/api/wallet/presentation-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload),
          })
          .then(res => res.json())
            .then(result => {
              if (result.success) {
                console.log('Presentation request created:', result.request_id);
                const holderLabel = holderPseudonym || holderDID || 'Anonymous holder';

                // Navigate to waiting page
                const params = new URLSearchParams({
                  requestId: result.request_id,
                  holderPseudonym: holderLabel,
                  presentationId: presentationId || '',
                });
                const waitingUrl = `/WaitingForHolder?${params.toString()}`;
                console.log('Navigating to:', waitingUrl);
                sessionStorage.setItem('verifier_active_request_id', result.request_id);
                sessionStorage.setItem('verifier_active_holder_label', holderLabel);
                router.push(waitingUrl);
              } else {
                throw new Error(result.message || 'Failed to create request');
              }
            })
          .catch(err => {
            console.error('Failed to create presentation request:', err);
            setError('Failed to create presentation request');
            setTimeout(() => {
              setError(null);
              setScanning(true);
            }, 3000);
          });
          
        } else if (data.type === 'verifiable_credential' || data.credentialSubject) {
          verifyCredential(data);
          
        } else if (data.type === 'presentation_request') {
          setError('This is a presentation request. Please scan a credential from a holder.');
          setTimeout(() => {
            setError(null);
            setScanning(true);
          }, 3000);
        } else {
          setError(`Invalid QR type. Expected credential presentation, got: ${data.type || 'unknown'}`);
          setTimeout(() => {
            setError(null);
            setScanning(true);
          }, 3000);
        }
      } catch (err) {
        console.error('Error parsing QR code:', err);
        setError('Invalid QR code format');
        setTimeout(() => {
          setError(null);
          setScanning(true);
        }, 3000);
      }
    }
  }, [scanning, selectedPreset, purpose, router, verifyCredential]);

  const handleScanError = (error: unknown) => {
    console.error('QR Scanner error:', error);
  };

  const handleBack = () => {
    if (step === 'verify') {
      setStep('scan');
      setScanning(true);
      setError(null);
      setSuccess(null);
    } else if (step === 'scan') {
      setStep('select');
      setScanning(false);
    } else {
      router.back();
    }
  };

  const handleDone = () => {
    router.push('/Presentation');
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-dark-300 hover:text-dark-500 transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="font-medium">Back</span>
          </button>
          <h1 className="text-xl font-bold text-dark-500">Scan & Verify</h1>
          <div className="w-20"></div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Select Preset */}
        {step === 'select' && (
          <div className="bg-white rounded-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <QrCode className="w-6 h-6 text-primary-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-dark-500">Select Verification Type</h2>
                <p className="text-sm text-dark-300">Choose what data you need to verify</p>
              </div>
            </div>

            {/* Verifier Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-blue-900">
                <strong>Verifying as:</strong> {verifierName}
              </p>
              <p className="text-xs text-blue-700 font-mono truncate">{verifierDID}</p>
            </div>

            {/* Preset Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-dark-500 mb-3">
                Choose Verification Type
              </label>
              <div className="space-y-3">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      selectedPreset?.id === preset.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-dark-100 hover:border-dark-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-dark-500">{preset.name}</h3>
                          {selectedPreset?.id === preset.id}
                        </div>
                        <p className="text-sm text-dark-300 mb-2">{preset.description}</p>
                        <div className="flex flex-wrap gap-1">
                          {preset.required_attributes.map((attr) => (
                            <span
                              key={attr}
                              className="text-xs px-2 py-1 bg-white text-dark-500 rounded-full"
                            >
                              {attr.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Purpose Input */}
            {selectedPreset && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-dark-500 mb-2">
                  Verification Purpose
                </label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-4 py-3 border border-dark-100 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="e.g., Age verification for bar entry"
                />
              </div>
            )}

            {selectedPreset && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-dark-500">
                    Attribute Value Policy (optional)
                  </label>
                  <span className="text-xs text-dark-300">
                    Restrict acceptable values for required attributes
                  </span>
                </div>
                <div className="space-y-3">
                  {selectedPreset.required_attributes.map((attribute) => {
                    const displayLabel = attribute.replace(/_/g, ' ');
                    const values = attributeValueRequirements[attribute] || [];
                    return (
                      <div key={attribute} className="border border-dark-100 rounded-xl p-4 bg-light-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-dark-500">
                              {displayLabel}
                            </p>
                            <p className="text-xs text-dark-300">
                              {values.length > 0
                                ? 'Only the values below will be accepted.'
                                : 'No value restrictions — all values are accepted.'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddAttributeValue(attribute)}
                            className="text-xs font-medium text-primary-600 hover:text-primary-700"
                          >
                            + Add value
                          </button>
                        </div>
                        {values.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {values.map((value) => (
                              <span
                                key={value}
                                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-primary-100 text-xs text-primary-700"
                              >
                                {value}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAttributeValue(attribute, value)}
                                  className="text-primary-500 hover:text-red-500"
                                  aria-label={`Remove value ${value}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Start Scan Button */}
            <button
              onClick={handleStartScan}
              disabled={!selectedPreset || !purpose.trim()}
              className={`w-full py-4 rounded-full font-medium text-lg flex items-center justify-center gap-2 ${
                selectedPreset && purpose.trim()
                  ? 'bg-primary-500 text-white hover:bg-primary-600'
                  : 'bg-light-50 text-dark-300 cursor-not-allowed'
              } transition-colors`}
            >
              <QrCode size={20} />
              Start Scanning
            </button>
          </div>
        )}

        {/* Scan QR */}
        {step === 'scan' && (
          <div className="bg-white rounded-2xl p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-dark-500 mb-2">Scan Credential</h2>
              <p className="text-dark-300 text-sm">
                Verifying: <strong>{selectedPreset?.name}</strong>
              </p>
              <p className="text-dark-300 text-xs mt-1">
                Purpose: {purpose}
              </p>
            </div>

            {/* QR Scanner */}
            <div className="relative w-full max-w-sm aspect-square bg-black overflow-hidden mb-8 rounded-2xl mx-auto">
              {typeof window !== 'undefined' && scanning && (
                <QrScanner
                  onDecode={handleScan}
                  onError={handleScanError}
                  containerStyle={{ 
                    width: '100%', 
                    height: '100%',
                    position: 'relative' 
                  }}
                  videoStyle={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover' 
                  }}
                />
              )}

              {/* Error Message */}
              {error && (
                <div className="absolute inset-0 bg-red-500 bg-opacity-90 flex items-center justify-center">
                  <div className="text-white text-center p-4">
                    <p className="text-lg font-semibold mb-2">{error}</p>
                    <p className="text-sm">Retrying...</p>
                  </div>
                </div>
              )}

              {/* Scanning overlay */}
              {scanning && !error && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-3/4 h-3/4 border-2 border-white rounded-lg relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-500 rounded-br-lg"></div>
                  </div>
                </div>
              )}
            </div>

            <p className="text-center text-sm text-dark-300">
              Position the credential QR code within the frame
            </p>
          </div>
        )}

        {step === 'verify' && (
          <div className="bg-white rounded-2xl p-8">
            <div className="text-center mb-8">
              {success ? (
                <>
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-12 h-12 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-green-600 mb-2">
                    Verification Successful!
                  </h2>
                  <p className="text-dark-300">{success}</p>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  </div>
                  <h2 className="text-2xl font-bold text-red-600 mb-2">
                    Verification Failed
                  </h2>
                  <p className="text-dark-300">{error}</p>
                </>
              )}
            </div>

            {/* Verification Details */}
            <div className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-200">
              <h3 className="font-medium text-blue-900 mb-2">Verification Details:</h3>
              <div className="space-y-1 text-sm text-blue-800">
                <p><strong>Type:</strong> {selectedPreset?.name}</p>
                <p><strong>Purpose:</strong> {purpose}</p>
                <p><strong>Required Attributes:</strong> {selectedPreset?.required_attributes.join(', ')}</p>
                <p><strong>Verified At:</strong> {new Date().toLocaleString()}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={handleDone}
                className="w-full bg-primary-500 text-white py-3 rounded-full font-medium hover:bg-primary-600 transition-colors"
              >
                View All Presentations
              </button>
              
              <button
                onClick={() => {
                  setStep('scan');
                  setScanning(true);
                  setError(null);
                  setSuccess(null);
                }}
                className="w-full bg-light-500 text-dark-500 py-3 rounded-full font-medium hover:bg-light-100 transition-colors"
              >
                Scan Another Credential
              </button>
              
              <button
                onClick={() => {
                  setStep('select');
                  setSelectedPreset(null);
                  setPurpose('');
                  setError(null);
                  setSuccess(null);
                }}
                className="w-full text-dark-300 py-3 font-medium hover:bg-light-100 transition-colors rounded-full"
              >
                Change Verification Type
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanPage;
