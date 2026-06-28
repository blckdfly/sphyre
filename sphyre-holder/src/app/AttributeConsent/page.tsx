'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Info,
  Lock,
  Shield,
  Loader2,
  CalendarClock,
  X,
} from 'lucide-react';
import apiService from '@/services/apiService';
import { navigateToVerificationSuccess, storeVerificationFailure, buildFailureData, toOptionalString } from '@/utils/verificationHelpers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

interface Attribute {
  key: string;
  value: unknown;
  label: string;
  mandatory: boolean;
  selected: boolean;
  valueRestricted: boolean;
}

type ExpiryChoice = '24h' | '7d' | '30d' | '90d' | 'custom' | 'never';

const normalizeAttrKey = (s: string) => s.toLowerCase().replace(/\s+/g, '_').trim();

const EXPIRY_OPTIONS: { value: ExpiryChoice; label: string; description: string }[] = [
  {
    value: '24h',
    label: '24 hours',
    description: 'Grant access for one day',
  },
  {
    value: '7d',
    label: '7 days',
    description: 'Typical short-term verification',
  },
  {
    value: '30d',
    label: '30 days',
    description: 'Recommended default period',
  },
  {
    value: '90d',
    label: '90 days',
    description: 'Extended access for repeat checks',
  },
  {
    value: 'custom',
    label: 'Custom date & time',
    description: 'Pick an exact expiration moment',
  },
  {
    value: 'never',
    label: 'Never expires',
    description: 'Manual revocation required',
  },
];

const EXPIRY_CHOICE_VALUES = new Set<ExpiryChoice>(
  EXPIRY_OPTIONS.map((option) => option.value)
);

function calculateConsentExpiry(
  choice: ExpiryChoice,
  customValue: string,
  referenceDate: Date = new Date()
): { iso: string | null; error?: string } {
  const nowMs = referenceDate.getTime();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;

  switch (choice) {
    case '24h':
      return { iso: new Date(nowMs + 24 * hourMs).toISOString() };
    case '7d':
      return { iso: new Date(nowMs + 7 * dayMs).toISOString() };
    case '30d':
      return { iso: new Date(nowMs + 30 * dayMs).toISOString() };
    case '90d':
      return { iso: new Date(nowMs + 90 * dayMs).toISOString() };
    case 'never':
      return { iso: null };
    case 'custom': {
      if (!customValue) {
        return { iso: null, error: 'Please choose an expiration date and time for consent.' };
      }
      const customDate = new Date(customValue);
      if (Number.isNaN(customDate.getTime())) {
        return { iso: null, error: 'Invalid custom expiration date. Please select a valid timestamp.' };
      }
      if (customDate.getTime() <= nowMs + 60 * 1000) {
        return { iso: null, error: 'Expiration must be at least one minute in the future.' };
      }
      return { iso: customDate.toISOString() };
    }
    default:
      return { iso: null };
  }
}

function describeExpirySelection(choice: ExpiryChoice, customValue: string): string {
  if (choice === 'never') {
    return 'Never expires — you can revoke consent anytime.';
  }

  const { iso, error } = calculateConsentExpiry(choice, customValue);
  if (error) {
    return error;
  }
  if (!iso) {
    return 'No expiration selected.';
  }

  const expiryDate = new Date(iso);
  const now = Date.now();
  const diffMs = expiryDate.getTime() - now;

  const absolute = expiryDate.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  if (diffMs <= 0) {
    return `Expired on ${absolute}`;
  }

  const minutes = Math.round(diffMs / (60 * 1000));
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));

  let relative = '';
  if (minutes < 120) {
    relative = `in ${Math.max(minutes, 1)} minutes`;
  } else if (hours < 48) {
    relative = `in ${hours} hours`;
  } else {
    relative = `in ${days} days`;
  }

  return `Expires ${relative} (${absolute})`;
}

function formatDateTimeLocalInputValue(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - tzOffset);
  return localDate.toISOString().slice(0, 16);
}

interface PredicateRequirement {
  attribute: string;
  operator: string;
  value: number;
  predicate_type?: string;
}

interface PredicateProofPayload {
  attribute_name: string;
  predicate_type: string;
  predicate_value: number;
  range_proof: {
    proof: string;
    commitment: string;
  };
}

interface ZKProofResponse {
  success: boolean;
  proof: PredicateProofPayload;
  message: string;
}

interface VerifierRequirements {
  request_id?: string;
  verifier_name?: string;
  verifier_did?: string;
  purpose?: string;
  required_predicates?: PredicateRequirement[];
  mandatory_attributes: string[];
  optional_attributes?: string[];
  value_restricted_attributes?: string[];
}

export default function AttributeConsentPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [credential, setCredential] = useState<Record<string, unknown> | null>(null);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [verifierReqs, setVerifierReqs] = useState<VerifierRequirements | null>(null);
  const [purpose, setPurpose] = useState('');
  const [anonymousAvailable, setAnonymousAvailable] = useState(false);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [anonymousStatus, setAnonymousStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [anonymousStatusMessage, setAnonymousStatusMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>('30d');
  const [customExpiry, setCustomExpiry] = useState('');
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  useEffect(() => {
    setMounted(true);

    const storedCredential = sessionStorage.getItem('selected_credential_for_sharing');
    const storedVerifierReqs = sessionStorage.getItem('verifier_requirements');
    
    if (!storedCredential) {
      router.push('/ShareCredentials');
      return;
    }

    try {
      const parsedCredential = JSON.parse(storedCredential);
      setCredential(parsedCredential);

      const hasAnonymous = Boolean((parsedCredential as Record<string, unknown>).anonymous_credential);
      setAnonymousAvailable(hasAnonymous);
      if (hasAnonymous) {
        setAnonymousMode(true);
        setAnonymousStatus('idle');
        setAnonymousStatusMessage('Anonymous proof will be generated before you submit.');
      } else {
        setAnonymousMode(false);
        setAnonymousStatus('idle');
        setAnonymousStatusMessage('');
      }

      // Parse verifier requirements if available
      let requirements: VerifierRequirements | null = null;
      if (storedVerifierReqs) {
        try {
          requirements = JSON.parse(storedVerifierReqs);
          setVerifierReqs(requirements);
          setPurpose(requirements.purpose || 'In-person verification');
        } catch (error) {
          console.warn('Failed to parse verifier requirements:', error);
        }
      }

      // Extract attributes from credential
      const previewObj = (parsedCredential as Record<string, unknown>).credential_preview as Record<string, unknown>
        || (((parsedCredential as Record<string, unknown>).attributes && Array.isArray((parsedCredential as Record<string, unknown>).attributes))
          ? Object.fromEntries(((parsedCredential as Record<string, unknown>).attributes as Array<{label?: string; id?: string; value?: unknown}>).map((a) => [a.label || a.id, a.value]))
          : {});

      // Normalize function for attribute ids
      const norm = normalizeAttrKey;
      
      // Extract predicate attributes - they MUST be included for plaintext validation
      const predicateAttributes = new Set((requirements?.required_predicates || []).map(p => norm(p.attribute)));
      const rawMandatoryAttrs = (requirements?.mandatory_attributes || []).map(norm);
      const mandatorySet = new Set(rawMandatoryAttrs.filter(attr => !predicateAttributes.has(attr)));
      
      console.log('Attribute filtering:', {
        raw_mandatory: rawMandatoryAttrs,
        predicate_attributes: Array.from(predicateAttributes),
        filtered_mandatory: Array.from(mandatorySet)
      });
      
      const valueRestrictedSet = new Set((requirements?.value_restricted_attributes || []).map(norm));

      const attrs: Attribute[] = Object.entries(previewObj).map(([key, value]) => {
        const isMandatory = mandatorySet.has(norm(key));
        const isValueRestricted = valueRestrictedSet.has(norm(key));

        return {
          key,
          value,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          mandatory: isMandatory,
          selected: isMandatory,
          valueRestricted: isValueRestricted,
        };
      });

      setAttributes(attrs);
    } catch (error) {
      console.error('Error loading credential:', error);
      router.push('/ShareCredentials');
    }
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedChoice = sessionStorage.getItem('consent_expiry_choice');
    if (storedChoice && EXPIRY_CHOICE_VALUES.has(storedChoice as ExpiryChoice)) {
      setExpiryChoice(storedChoice as ExpiryChoice);
    }
    const storedCustom = sessionStorage.getItem('consent_expiry_custom');
    if (storedCustom) {
      setCustomExpiry(storedCustom);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('consent_expiry_choice', expiryChoice);
  }, [expiryChoice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (customExpiry) {
      sessionStorage.setItem('consent_expiry_custom', customExpiry);
    } else {
      sessionStorage.removeItem('consent_expiry_custom');
    }
  }, [customExpiry]);

  const handleToggleAttribute = (key: string) => {
    setAttributes(prev => 
      prev.map(attr => 
        attr.key === key && !attr.mandatory
          ? { ...attr, selected: !attr.selected }
          : attr
      )
    );
  };

  const handleSelectAll = () => {
    setAttributes(prev => prev.map(attr => ({ ...attr, selected: true })));
  };

  const handleDeselectOptional = () => {
    setAttributes(prev => prev.map(attr => 
      attr.mandatory ? attr : { ...attr, selected: false }
    ));
  };

  const valueRestrictedCount = useMemo(
    () => attributes.filter((attr) => attr.valueRestricted).length,
    [attributes],
  );

  const handleAnonymousToggle = () => {
    if (!anonymousAvailable) {
      return;
    }
    setAnonymousMode(prev => {
      const next = !prev;
      if (next) {
        setAnonymousStatus('idle');
        setAnonymousStatusMessage('Anonymous proof will be generated before you submit.');
      } else {
        setAnonymousStatus('idle');
        setAnonymousStatusMessage('');
      }
      return next;
    });
  };

  const handleContinue = async () => {
    if (!credential || isSubmittingRef.current) return;

    const presentationRequestRaw = sessionStorage.getItem('presentation_request');
    const presentationReqParsed = presentationRequestRaw ? JSON.parse(presentationRequestRaw) : null;
    const predicatesFromRequest: PredicateRequirement[] =
      (presentationReqParsed?.required_predicates as PredicateRequirement[])
      || (presentationReqParsed?.requiredPredicates as PredicateRequirement[])
      || [];
    const predicatesToUse: PredicateRequirement[] =
      verifierReqs?.required_predicates && verifierReqs.required_predicates.length > 0
        ? verifierReqs.required_predicates
        : predicatesFromRequest;

    const selectedAttrs = attributes.filter(a => a.selected);
    const selectedKeys = new Set(selectedAttrs.map(a => normalizeAttrKey(a.key)));
    const sortedSelectedAttrs = [...selectedAttrs].sort((a, b) => a.key.localeCompare(b.key));
    
    // IMPORTANT: Add predicate attributes to selected attributes for plaintext validation
    if (predicatesToUse.length > 0) {
      console.log('Adding predicate attributes to selected attributes for validation');
      
      for (const pred of predicatesToUse) {
        const normPredAttr = normalizeAttrKey(pred.attribute);
        const predicateAttr = attributes.find(a => normalizeAttrKey(a.key) === normPredAttr);
        
        if (predicateAttr && !selectedKeys.has(normPredAttr)) {
          console.log(`Auto-adding predicate attribute: ${pred.attribute} (${predicateAttr.key})`);
          sortedSelectedAttrs.push(predicateAttr);
          selectedKeys.add(normPredAttr);
        } else if (!predicateAttr) {
          console.warn(`Predicate attribute '${pred.attribute}' not found in credential preview, cannot attach plaintext value`);
        }
      }

      sortedSelectedAttrs.sort((a, b) => a.key.localeCompare(b.key));
    }
    
    if (selectedAttrs.length === 0) {
      alert('You must share at least the mandatory attributes');
      return;
    }

    const mandatoryAttrs = attributes.filter(a => a.mandatory);
    const allMandatorySelected = mandatoryAttrs.every(a => a.selected);
    if (!allMandatorySelected) {
      alert('All mandatory attributes must be shared');
      return;
    }

    const holderDID = sessionStorage.getItem('holder_did_for_presentation');
    if (!holderDID) {
      alert('Unable to locate your DID for presentation. Please retry the flow.');
      return;
    }

    const { iso: consentExpiresAtIso, error: expiryError } = calculateConsentExpiry(expiryChoice, customExpiry);
    if (expiryError) {
      alert(expiryError);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const predicateProofs: PredicateProofPayload[] = [];
      console.log('Checking for required_predicates:', predicatesToUse);
      
      if (predicatesToUse.length > 0) {
        console.log(`Processing ${predicatesToUse.length} predicate requirements`);
        for (const pred of predicatesToUse) {
          try {
            console.log(`Generating ZK proof for ${pred.attribute} ${pred.operator} ${pred.value}`);
            console.log('Predicate data types:', {
              attribute: typeof pred.attribute,
              operator: typeof pred.operator,
              value: typeof pred.value,
              valueValue: pred.value,
              valueConstructor: pred.value?.constructor?.name
            });

            const credentialId = (credential as Record<string, unknown> & { id: string }).id;
            const response = await fetch(
              `${API_URL}/api/wallet/credentials/${credentialId}/predicate-proof`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  attribute: pred.attribute,
                  operator: pred.operator,
                  value: pred.value,
                }),
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              console.error('ZKP generation failed - HTTP status:', response.status);
              console.error('Error response:', errorText);
              throw new Error(`ZKP generation failed: ${response.status} ${errorText}`);
            }

            const proof: ZKProofResponse = await response.json();
            if (!proof?.proof) {
              throw new Error('Predicate proof payload missing `proof` field');
            }
            predicateProofs.push(proof.proof);
            console.log('ZK proof generated:', proof);
          } catch (error) {
            console.error('ZKP generation failed:', error);
            const resolvedCredentialType =
              toOptionalString((credential as Record<string, unknown>)?.credential_type) ??
              toOptionalString((credential as Record<string, unknown>)?.title) ??
              'Unknown';
            const userFriendlyReason =
              error instanceof Error && error.message.includes('does not satisfy predicate')
                ? 'Your credential does not meet the verifier requirement.'
                : (error instanceof Error && toOptionalString(error.message))
                  ? error.message
                  : 'Failed to generate zero-knowledge proof. Please try again.';

            // Mark request rejected server-side so verifier stops waiting
            try {
              const presentationRequestRaw = sessionStorage.getItem('presentation_request');
              const presentationReq = presentationRequestRaw ? JSON.parse(presentationRequestRaw) : null;
              const actualRequestId = presentationReq?.request_id || presentationReq?.id;
              if (actualRequestId && holderDID) {
                await fetch(`${API_URL}/api/wallet/presentation-requests/${actualRequestId}/reject`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    holder_did: holderDID,
                    reason: userFriendlyReason,
                    error_code: 'PREDICATE_PROOF_FAILED',
                  }),
                }).catch((err) => console.warn('Failed to notify verifier about rejection:', err));
              }
            } catch (err) {
              console.warn('Failed to process rejection notification:', err);
            }

            const failurePayload = buildFailureData(
              {
                credential_type: resolvedCredentialType,
                verifier_name: verifierReqs?.verifier_name || 'Verifier',
                verifier_did: verifierReqs?.verifier_did,
              },
              {
                reason: userFriendlyReason,
                error_code: 'PREDICATE_PROOF_FAILED',
              },
              'Verification failed',
            );

            storeVerificationFailure(failurePayload);
            setIsSubmitting(false);
            isSubmittingRef.current = false;
            router.push('/VerificationFailure');
            return;
          }
        }
      }

      const rawPreview: Record<string, unknown> = {};
      const attributeLookup: Record<string, Attribute> = {};
      attributes.forEach(attr => {
        attributeLookup[attr.key] = attr;
      });

      const normalizedKeys = sortedSelectedAttrs.map(attr => {
        if (!verifierReqs?.mandatory_attributes || verifierReqs.mandatory_attributes.length === 0) {
          return attr.key;
        }

        if (verifierReqs.mandatory_attributes.includes(attr.key)) {
          return attr.key;
        }

        const matched = verifierReqs.mandatory_attributes.find(requestedKey => {
          const candidate = attributeLookup[requestedKey];
          return candidate && candidate.label === attr.label;
        });

        return matched ?? attr.key;
      });

      normalizedKeys.forEach((normalizedKey, index) => {
        const original = sortedSelectedAttrs[index];
        rawPreview[normalizedKey] = original.value;
      });

      const transportPreview: Record<string, unknown> = {};
      const backendSelectedAttributes: Record<string, unknown> = {};

      normalizedKeys.forEach((key) => {
        backendSelectedAttributes[key] = rawPreview[key];
        transportPreview[key] = anonymousMode
          ? 'verified via anonymous proof'
          : rawPreview[key];
      });

      const filteredCredential = {
        ...credential,
        credential_preview: transportPreview,
        attributes_to_share: normalizedKeys,
      };

      let anonymousProofPayload: unknown = undefined;
      if (anonymousMode) {
        const credentialId = (credential as Record<string, unknown> & { id?: string; _id?: string }).id ||
          (credential as Record<string, unknown> & { _id?: string })._id;
        if (!credentialId) {
          setAnonymousStatus('error');
          setAnonymousStatusMessage('Missing credential identifier for anonymous mode.');
          alert('Cannot enable anonymous mode because the credential is missing an identifier.');
          return;
        }

        setAnonymousStatus('loading');
        setAnonymousStatusMessage('Generating anonymous proof...');

        try {
          const proofResponse = await apiService.getAnonymousProof(
            holderDID,
            credentialId,
            sortedSelectedAttrs.map(a => a.key)
          );

          if (!proofResponse.success || !proofResponse.data) {
            const errorMsg = proofResponse.error || 'Failed to obtain anonymous proof.';
            setAnonymousStatus('error');
            setAnonymousStatusMessage(errorMsg);
            alert(errorMsg);
            return;
          }

          const payload = proofResponse.data as { proof?: unknown };
          if (!payload.proof) {
            setAnonymousStatus('error');
            setAnonymousStatusMessage('Anonymous proof was not returned by the server.');
            alert('Anonymous proof was not returned by the server.');
            return;
          }

          anonymousProofPayload = payload.proof;
          setAnonymousStatus('ready');
          setAnonymousStatusMessage('Anonymous proof ready.');
        } catch (error) {
          console.error('Anonymous proof generation failed:', error);
          const message = error instanceof Error ? error.message : 'Anonymous proof generation failed.';
          setAnonymousStatus('error');
          setAnonymousStatusMessage(message);
          alert(message);
          return;
        }
      }

      sessionStorage.setItem('selected_credential_for_sharing', JSON.stringify(filteredCredential));
      sessionStorage.setItem('consent_purpose', purpose);
      if (consentExpiresAtIso) {
        sessionStorage.setItem('consent_expires_at', consentExpiresAtIso);
      } else {
        sessionStorage.removeItem('consent_expires_at');
      }
      sessionStorage.setItem('zk_proofs', JSON.stringify(predicateProofs));

      const presentationRequest = sessionStorage.getItem('presentation_request');
      const verifierRequirements = sessionStorage.getItem('verifier_requirements');

      const credentialRecord = credential as Record<string, unknown>;
      const resolvedCredentialType =
        toOptionalString(credentialRecord?.credential_type) ??
        toOptionalString(credentialRecord?.title) ??
        'Unknown';

      if (presentationRequest) {
        try {
          const request = JSON.parse(presentationRequest);
          const verifierReqs = verifierRequirements ? JSON.parse(verifierRequirements) : null;
          
          console.log('Request data check:', {
            request_id: request.request_id || request.id,
            request_id_type: typeof (request.request_id || request.id),
            request_keys: Object.keys(request),
            full_request: request,
            required_predicates: request.required_predicates,
            has_predicates: !!request.required_predicates,
            predicates_count: request.required_predicates?.length || 0,
            verifier_reqs_predicates: verifierReqs?.required_predicates
          });

          const actualRequestId = request.request_id || request.id;
          
          console.log('Sending approval to verifier:', {
            request_id: actualRequestId,
            holder_did: holderDID,
            attributes: normalizedKeys,
            zk_proofs: predicateProofs.length,
            consent_expires_at: consentExpiresAtIso,
          });

          const approvalURL = `${API_URL}/api/wallet/presentation-requests/${actualRequestId}/approve`;
          
          console.log('Approval URL:', approvalURL);
          console.log('Request ID:', actualRequestId);

          const credentialIdentifier =
            (credential as Record<string, unknown>).id ??
            (credential as Record<string, unknown>)._id ??
            (credential as Record<string, unknown>).credential_id;

          const approvalPayload: Record<string, unknown> = {
            holder_did: holderDID,
            selected_attributes: backendSelectedAttributes,
            consent_expires_at: consentExpiresAtIso,
          };

          if (credentialIdentifier) {
            approvalPayload.credential_id = String(credentialIdentifier);
          }

          if (predicateProofs.length > 0) {
            approvalPayload.zk_proofs = predicateProofs;
            console.log('Adding zk_proofs to approval payload:', {
              count: predicateProofs.length,
              proofs: predicateProofs.map(p => ({
                attribute: p.attribute_name || 'unknown',
                hasProof: !!p.range_proof
              }))
            });
          } else {
            console.log('No zk_proofs to add to approval payload');
          }
          if (anonymousProofPayload) {
            approvalPayload.anonymous_proof = anonymousProofPayload;
          }

          const approvalResponse = await fetch(approvalURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(approvalPayload),
          });

          console.log('Approval response status:', approvalResponse.status);
          console.log('Approval response ok:', approvalResponse.ok);

          const resultJson = await approvalResponse
            .json()
            .catch(() => ({} as Record<string, unknown>));

          console.log('Approval response body:', resultJson);

          if (!approvalResponse.ok) {
            console.error('Approval failed:', resultJson);

            const serverReason = toOptionalString((resultJson as { reason?: unknown }).reason) ||
              toOptionalString((resultJson as { message?: unknown }).message);
            const serverCode = toOptionalString((resultJson as { error_code?: unknown }).error_code);
            const serverDetails = (resultJson as { details?: unknown }).details;

            const failurePayload = buildFailureData(
              {
                credential_type: resolvedCredentialType,
                verifier_name: verifierReqs?.verifier_name || 'Verifier',
                verifier_did: verifierReqs?.verifier_did,
              },
              {
                reason: serverReason,
                error_code: serverCode ?? `HTTP_${approvalResponse.status}`,
                details: serverDetails,
              },
              'Verification failed',
            );

            storeVerificationFailure(failurePayload);

            sessionStorage.removeItem('verifier_requirements');
            sessionStorage.removeItem('selected_credential_for_sharing');

            router.push('/VerificationFailure');
            return;
          }

          const result = resultJson;
          console.log('Presentation sent to verifier:', result);

          if (result.consent) {
            try {
              const { upsertConsent } = await import('@/lib/consent');
              upsertConsent({
                id: result.consent.id,
                requesterId: result.consent.verifier_did,
                requesterName: result.consent.verifier_did.split(':').pop() || 'Unknown',
                purpose: result.consent.purpose,
                scope: (result.consent.data_categories as string[]).map((cat) => ({
                  id: cat,
                  label: cat,
                })),
                createdAt: new Date(result.consent.created_at).getTime(),
                expiresAt: result.consent.expires_at ? new Date(result.consent.expires_at).getTime() : undefined,
                active: !result.consent.revoked,
              });
              console.log('Consent stored immediately:', result.consent.id);
            } catch (err) {
              console.warn('Failed to store consent:', err);
            }
          }

          const sharedAttributes = [...normalizedKeys];

          const successData = {
            credential_id: credentialIdentifier ? String(credentialIdentifier) : request.request_id,
            credential_type: resolvedCredentialType,
            verifier_name: request.verifier_name || 'Verifier',
            verifier_did: request.verifier_did,
            verified_at: new Date().toISOString(),
            attributes_shared: sharedAttributes,
          };

          sessionStorage.removeItem('verifier_requirements');
          sessionStorage.removeItem('selected_credential_for_sharing');
          sessionStorage.removeItem('verification_failure');

          navigateToVerificationSuccess(router, successData);
          return;
        } catch (error) {
          console.error('Failed to send presentation:', error);

          const failurePayload = buildFailureData(
            {
              credential_type: resolvedCredentialType,
              verifier_name: verifierReqs?.verifier_name || 'Verifier',
              verifier_did: verifierReqs?.verifier_did,
            },
            {
              reason:
                error instanceof Error && toOptionalString(error.message)
                  ? error.message
                  : 'Failed to send presentation to verifier',
              error_code: 'PRESENTATION_ERROR',
              details: {
                anonymous_mode: anonymousMode,
              },
            },
          );

          storeVerificationFailure(failurePayload);

          sessionStorage.removeItem('verifier_requirements');
          sessionStorage.removeItem('selected_credential_for_sharing');

          router.push('/VerificationFailure');
          return;
        }
      } else if (presentationRequest) {
        router.push('/CredentialConfirmation');
      } else {
        console.error('Missing presentation_request context; cannot submit.');
        const failurePayload = buildFailureData(
          {
            credential_type: resolvedCredentialType,
            verifier_name: verifierReqs?.verifier_name || 'Verifier',
            verifier_did: verifierReqs?.verifier_did,
          },
          {
            reason: 'Missing presentation context. Please rescan or start over.',
            error_code: 'MISSING_PRESENTATION_REQUEST',
          },
          'Verification failed',
        );
        storeVerificationFailure(failurePayload);
        router.push('/VerificationFailure');
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const selectedCount = attributes.filter(a => a.selected).length;
  const mandatoryCount = attributes.filter(a => a.mandatory).length;
  const optionalCount = attributes.length - mandatoryCount;

  const expirySummary = useMemo(
    () => describeExpirySelection(expiryChoice, customExpiry),
    [expiryChoice, customExpiry]
  );

  if (!mounted || !credential) {
    return (
      <div className="min-h-screen bg-light-50 flex items-center justify-center">
        <p className="text-dark-300">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-50">
      <div className="bg-white px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center">
          <button 
            onClick={() => {
              // Go back to appropriate page based on flow
              const presentationRequest = sessionStorage.getItem('presentation_request');
              router.push(presentationRequest ? '/CredentialSelection' : '/ShareCredentials');
            }} 
            className="mr-3"
          >
            <ChevronLeft size={24} className="text-dark-500" />
          </button>
          <div>
            <h1 className="text-lg font-medium text-dark-500">Attribute Consent</h1>
            <p className="text-xs text-dark-300">Choose what to share</p>
          </div>
        </div>
      </div>

      <div className="p-6 pb-32">
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Anonymous proof</p>
              <p className="text-xs text-slate-600 mt-1">Hide raw attributes using an unlinkable proof.</p>
            </div>
            <button
              type="button"
              onClick={handleAnonymousToggle}
              aria-pressed={anonymousMode}
              disabled={!anonymousAvailable}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                !anonymousAvailable
                  ? 'bg-slate-300 cursor-not-allowed'
                  : anonymousMode
                  ? 'bg-emerald-500'
                  : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  anonymousMode ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {!anonymousAvailable && (
            <p className="text-xs text-slate-600 mt-2">
              This credential doesn’t support anonymous proofs.
            </p>
          )}
          {anonymousMode && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              {anonymousStatus === 'loading' && (
                <>
                  <Loader2 size={16} className="animate-spin text-slate-500" />
                  <span className="text-slate-600">{anonymousStatusMessage || 'Preparing anonymous proof…'}</span>
                </>
              )}
              {anonymousStatus === 'ready' && (
                <>
                  <Shield size={16} className="text-emerald-600" />
                  <span className="text-emerald-600">{anonymousStatusMessage || 'Anonymous proof ready.'}</span>
                </>
              )}
              {anonymousStatus === 'error' && (
                <>
                  <AlertCircle size={16} className="text-red-500" />
                  <span className="text-red-600">{anonymousStatusMessage}</span>
                </>
              )}
              {anonymousStatus === 'idle' && !anonymousStatusMessage && (
                <span className="text-slate-600">An anonymous proof will accompany this share.</span>
              )}
              {anonymousStatus === 'idle' && anonymousStatusMessage && (
                <span className="text-slate-600">{anonymousStatusMessage}</span>
              )}
            </div>
          )}
        </div>

        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-start">
            <Info size={20} className="text-emerald-600 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-emerald-900 space-y-1">
              <p className="font-semibold">Privacy-first sharing</p>
              <p className="text-emerald-800">
                Anonymous proofs hide raw values and you decide exactly what leaves your wallet. Mandatory attributes are required
                by the verifier, while optional ones stay under your control.
              </p>
              <p className="text-emerald-800">
                Only selected attributes are ever shared, and you can revoke consent anytime from Consent Management.
              </p>
            </div>
          </div>
        </div>

        {/* Credential Info */}
        <div className="mb-6 bg-white rounded-xl p-5 shadow-sm border border-dark-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-dark-500">
              {String(credential.credential_type || 'Credential')}
            </h2>
            <span className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
              Active
            </span>
          </div>
          
          {verifierReqs && (
            <>
              <div className="text-sm text-dark-400 mb-2">
                <span className="font-medium">Verifier:</span> {verifierReqs.verifier_name || 'Unknown'}
              </div>
              <div className="text-sm text-dark-400 mb-3">
                <span className="font-medium">Purpose:</span> {verifierReqs.purpose || 'Verification'}
              </div>
            </>
          )}

          <div className="pt-3 border-t border-dark-100">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-dark-400">Total:</span>
                  <span className="ml-2 font-semibold text-dark-500">{attributes.length}</span>
                </div>
                <div>
                  <span className="text-dark-400">Mandatory:</span>
                  <span className="ml-2 font-semibold text-orange-600">{mandatoryCount}</span>
                </div>
                <div>
                  <span className="text-dark-400">Optional:</span>
                  <span className="ml-2 font-semibold text-blue-600">{optionalCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Zero-Knowledge Predicates */}
        {verifierReqs?.required_predicates && verifierReqs.required_predicates.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-dark-500 mb-3">
              Zero-Knowledge Predicates (Automatically Proven)
            </h3>
            <div className="space-y-2">
              {verifierReqs.required_predicates.map((pred, idx) => (
                <div key={idx} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Lock size={14} className="text-purple-600" />
                    <span className="text-sm font-medium text-purple-900">
                       {pred.attribute} {pred.operator} {pred.value}: PROVEN
                    </span>
                  </div>
                  <p className="text-xs text-purple-700 ml-6">
                    Actual value NOT revealed (cryptographic proof only)
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-dark-500 mb-2">
            Purpose of Sharing
          </label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full px-4 py-3 border border-dark-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-dark-500"
            placeholder="e.g., Age verification, Identity check, etc."
          />
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-dark-500">
              Consent expiry
            </label>
            <span className="text-xs text-dark-300">Choose how long access is allowed</span>
          </div>

          <button
            type="button"
            onClick={() => setShowExpiryPicker(true)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-dark-100 bg-white hover:border-primary-200 hover:bg-primary-50 transition"
          >
            <div className="text-left">
              <p className="text-sm font-semibold text-dark-500">{expirySummary}</p>
              <p className="text-xs text-dark-300 mt-1">Tap to adjust consent duration</p>
            </div>
            <CalendarClock className="text-primary-500" size={18} />
          </button>
        </div>

        <div className="mb-4">
          {valueRestrictedCount > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-primary-200 bg-primary-50/60 px-3 py-2 text-xs text-primary-800">
              <Shield size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                {valueRestrictedCount === 1
                  ? '1 attribute has an exact-value policy from the verifier. Make sure the credential value is accurate before sharing.'
                  : `${valueRestrictedCount} attributes have exact-value policies from the verifier. Ensure their values match your credential before sharing.`}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-dark-500">
              Attributes ({selectedCount} selected)
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="text-xs px-3 py-1.5 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors"
              >
                Select All
              </button>
              <button
                onClick={handleDeselectOptional}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Mandatory Only
              </button>
            </div>
          </div>
        </div>

        {/* Attributes List */}
        <div className="space-y-3">
          {attributes.map((attr) => (
            <div
              key={attr.key}
              className={`
                bg-white rounded-xl p-4 border-2 transition-all cursor-pointer
                ${attr.selected 
                  ? 'border-primary-500 bg-primary-50' 
                  : 'border-dark-100 hover:border-dark-200'
                }
                ${attr.mandatory ? 'opacity-100' : 'opacity-90'}
              `}
              onClick={() => handleToggleAttribute(attr.key)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-dark-500">{attr.label}</span>
                    {attr.mandatory && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                        <Lock size={10} />
                        Mandatory
                      </span>
                    )}
                    {!attr.mandatory && attr.valueRestricted && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">
                        <Shield size={10} />
                        Policy Check
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-dark-400 truncate">
                    {String(attr.value)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {attr.selected ? (
                    <div className="flex items-center gap-1.5 text-primary-600">
                      <Eye size={18} />
                      <CheckCircle2 size={20} className="text-primary-600" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <EyeOff size={18} />
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>
                    </div>
                  )}
                </div>
              </div>

              {attr.mandatory && !attr.selected && (
                <div className="mt-2 flex items-start gap-2 text-xs text-orange-600">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>This attribute is required by the verifier</span>
                </div>
              )}
              {!attr.mandatory && attr.valueRestricted && (
                <div className="mt-2 flex items-start gap-2 text-xs text-primary-600">
                  <Info size={14} className="mt-0.5 flex-shrink-0" />
                  <span>The verifier will validate this value. Share only if it matches your credential.</span>
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
      {showExpiryPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-dark-500">Set consent expiry</h3>
              <button
                type="button"
                onClick={() => setShowExpiryPicker(false)}
                className="p-1 rounded-full text-dark-300 hover:text-dark-500 hover:bg-dark-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-2">
              {EXPIRY_OPTIONS.map((option) => {
                const isActive = expiryChoice === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setExpiryChoice(option.value)}
                    className={`text-left px-4 py-3 rounded-xl border transition-all ${
                      isActive
                        ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm'
                        : 'border-dark-100 bg-white text-dark-400 hover:border-primary-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-sm font-semibold ${isActive ? 'text-primary-700' : 'text-dark-500'}`}>
                          {option.label}
                        </p>
                        <p className="text-xs text-dark-300 mt-1">{option.description}</p>
                      </div>
                      {isActive && (
                        <CheckCircle2 size={18} className="text-primary-600 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {expiryChoice === 'custom' && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-dark-400 mb-1">
                  Select expiration date & time
                </label>
                <input
                  type="datetime-local"
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(e.target.value)}
                  min={formatDateTimeLocalInputValue(new Date(Date.now() + 5 * 60 * 1000))}
                  className="w-full px-3 py-2 border border-dark-200 rounded-lg text-dark-500 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-dark-300 mt-1">
                  Use your local timezone. Expiration must be in the future.
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowExpiryPicker(false)}
                className="px-4 py-2 text-sm font-medium text-dark-400 hover:text-dark-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowExpiryPicker(false)}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white">
        <div className="max-w-md mx-auto">
          {mandatoryCount > 0 && selectedCount < mandatoryCount && (
            <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-start gap-2 text-sm text-orange-800">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>
                  You must select all {mandatoryCount} mandatory attributes to continue
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleContinue}
            disabled={selectedCount < mandatoryCount || isSubmitting}
            className={`
              w-full py-4 rounded-lg font-medium text-white transition-all
              ${selectedCount >= mandatoryCount && !isSubmitting
                ? 'bg-primary-500 hover:bg-primary-600 active:scale-95 shadow-lg'
                : 'bg-gray-300 cursor-not-allowed'
              }
            `}
          >
            {isSubmitting ? 'Submitting...' : `Continue to Present`}
          </button>
        </div>
      </div>
    </div>
  );
}
