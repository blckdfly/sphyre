'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, Shield, ExternalLink, ChevronLeft, Home, ShieldAlert, ShieldCheck, Hourglass, TriangleAlert, FileText, Link as LinkIcon } from 'lucide-react';
import { checkConsent } from '@/services/consentService';

interface CredentialData {
  name?: string;
  type?: string[];
  issuer?: string;
  issuanceDate?: string;
  credentialSubject?: {
    id?: string;
    type?: string;
    claims?: Record<string, unknown>;
    extensions?: string[];
    holder_pseudonym?: string;
  };
  proof?: {
    type?: string;
    jws?: string;
  };
  [key: string]: unknown;
}

interface VerificationResult {
  success: boolean;
  verified: boolean;
  credential: CredentialData;
  verification: {
    ipfs_hash: string;
    issuer: string;
    signature_valid: boolean;
    on_chain: boolean;
    blockchain_verified: boolean;
    timestamp: string;
    metadata_uri?: string | null;
    ipfs_gateway_url?: string | null;
    blockchain_tx?: string | null;
    blockchain_reference?: string | null;
    warning?: string | null;
    provided_attributes?: string[];
    revoked_attributes?: string[];
    credential_status?: string | null;
    selected_attributes?: Record<string, unknown> | null;
    zk_proofs?: unknown[];
    predicate_proofs?: unknown[];
    consent_expires_at?: string | null;
    evidence?: Array<{
      label: string;
      filename?: string;
      gateway_url?: string | null;
      ipfs_hash?: string;
      content_type?: string | null;
      size?: number | null;
    }>;
    evidence_errors?: string[];
    evidence_required?: string[];
    evidence_status?: string | null;
    credential_id?: string | null;
    extensions?: string[];
  };
  message: string;
  holderLabel: string;
  subjectDid: string | null;
}

interface VerificationQueryParams {
  ipfsHash: string;
  presentationId?: string;
  verifierDid?: string;
}

interface EvidenceApi {
  label?: string;
  filename?: string;
  gateway_url?: string | null;
  gatewayUrl?: string | null;
  ipfs_hash?: string;
  ipfsHash?: string;
  content_type?: string | null;
  contentType?: string | null;
  size?: number | string | null;
}

interface VerificationApi {
  evidence?: EvidenceApi[];
  evidence_attachments?: EvidenceApi[];
  provided_attributes?: unknown;
  revoked_attributes?: unknown;
  evidence_required?: unknown;
  evidence_status?: unknown;
  credential_status?: unknown;
  ipfs_hash?: unknown;
  issuer?: unknown;
  signature_valid?: unknown;
  on_chain?: unknown;
  blockchain_verified?: unknown;
  timestamp?: unknown;
  metadata_uri?: unknown;
  ipfs_gateway_url?: unknown;
  blockchain_tx?: unknown;
  blockchain_reference?: unknown;
  warning?: unknown;
  selected_attributes?: Record<string, unknown> | null;
  zk_proofs?: unknown;
  predicate_proofs?: unknown;
  consent_expires_at?: unknown;
  credential_id?: unknown;
  extensions?: unknown;
  [key: string]: unknown;
}

interface DirectVerificationResponse {
  success?: boolean;
  verified?: boolean;
  ipfs_hash?: string;
  credential?: CredentialData;
  verification?: VerificationApi;
  message?: string;
  [key: string]: unknown;
}

interface PresentationApi {
  id: string;
  prover_did: string;
  prover_pseudonym?: string | null;
  verifier_did: string;
  presentation_type: string;
  credential_ids: string[];
  presentation_data: Record<string, unknown>;
  jwt: string;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
  verified_at?: string | null;
  is_verified?: boolean;
}

const normalizeAttributeKey = (value: string): string =>
  value.trim().replace(/[\s_-]+/g, '').toLowerCase();

const toStringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export default function VerifyCredentialPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech',
    []
  );

  const formatBytes = (bytes?: number | null): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };

  const queryParams: VerificationQueryParams = useMemo(() => {
    const ipfsHashParam = params.ipfsHash as string;
    const presentationIdParam = searchParams.get('presentationId') || undefined;
    const verifierDidParam = searchParams.get('verifierDid') || undefined;

    return {
      ipfsHash: ipfsHashParam,
      presentationId: presentationIdParam,
      verifierDid: verifierDidParam,
    };
  }, [params, searchParams]);

  const ipfsHash = queryParams.ipfsHash;
  
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [consentLoading, setConsentLoading] = useState(false);
  const [consentValid, setConsentValid] = useState<boolean | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [skipConsentCheck] = useState(false);

  const checkConsentStatus = useCallback(
    async (userDid: string) => {
      try {
        setConsentLoading(true);
        setConsentError(null);

        const storedVerifierDid =
          queryParams.verifierDid ||
          localStorage.getItem('verifierDID') ||
          localStorage.getItem('verifierDid') ||
          'did:alyra:verifier';

        const consentResult = await checkConsent(
          userDid,
          storedVerifierDid,
          'credential_verification'
        );

        setConsentValid(consentResult.isValid);

        if (!consentResult.isValid) {
          setConsentError('User has not granted consent for verification');
        }
      } catch (err) {
        console.error('Consent check error:', err);
        setConsentError(err instanceof Error ? err.message : 'Failed to check consent');
        setConsentValid(false);
      } finally {
        setConsentLoading(false);
      }
    },
    [queryParams.verifierDid]
  );

  const buildResultFromPresentation = useCallback(
    (presentation: PresentationApi, fallbackIpfs?: string): VerificationResult => {
      const presentationData = presentation.presentation_data || {};
      const ipfsFromPresentation = typeof presentationData.ipfs_hash === 'string'
        ? (presentationData.ipfs_hash as string)
        : undefined;

      const ipfsHashResolved = ipfsFromPresentation || fallbackIpfs || queryParams.ipfsHash;
      const status = presentation.status;
      const verified = Boolean(presentation.is_verified) || status === 'verified';

      const providedAttributesRaw = Array.isArray(presentationData.provided_attributes)
        ? (presentationData.provided_attributes as string[])
        : [];

      const revokedAttributes = Array.isArray(presentationData.revoked_attributes)
        ? (presentationData.revoked_attributes as string[])
        : [];

      const revokedLookup = new Set(revokedAttributes.map(normalizeAttributeKey));
      const providedAttributes = providedAttributesRaw.filter(
        (attr) => !revokedLookup.has(normalizeAttributeKey(attr))
      );

      const evidenceRequired = Array.isArray(presentationData.evidence_required)
        ? (presentationData.evidence_required as string[])
        : [];

      const evidenceStatus = typeof presentationData.evidence_status === 'string'
        ? (presentationData.evidence_status as string)
        : null;

      const credentialStatus = typeof presentationData.credential_status === 'string'
        ? (presentationData.credential_status as string)
        : providedAttributes.length > 0
          ? 'active'
          : revokedAttributes.length > 0
            ? 'revoked'
            : undefined;

      const selectedAttributes = presentationData.selected_attributes &&
        typeof presentationData.selected_attributes === 'object'
        ? (presentationData.selected_attributes as Record<string, unknown>)
        : undefined;

      const filteredSelectedAttributes = (() => {
        if (
          presentationData.anonymous_proof &&
          typeof presentationData.anonymous_proof === 'object' &&
          presentationData.anonymous_proof !== null &&
          typeof (presentationData.anonymous_proof as Record<string, unknown>).revealed_attributes === 'object'
        ) {
          const revealed = (presentationData.anonymous_proof as { revealed_attributes?: Record<string, unknown> }).revealed_attributes ?? {};
          return Object.fromEntries(
            Object.keys(revealed)
              .filter((key) => !revokedLookup.has(normalizeAttributeKey(key)))
              .map((key) => [key, 'verified via anonymous proof'])
          );
        }

        return selectedAttributes
          ? Object.fromEntries(
              Object.entries(selectedAttributes).filter(
                ([key]) => !revokedLookup.has(normalizeAttributeKey(key))
              )
            )
          : undefined;
      })();

      const credentialName = typeof presentationData.credential_name === 'string'
        ? (presentationData.credential_name as string)
        : presentation.presentation_type;

      const issuerDid = typeof presentationData.issuer_did === 'string'
        ? (presentationData.issuer_did as string)
        : presentation.verifier_did;

      const zkProofs = Array.isArray(presentationData.zk_proofs)
        ? (presentationData.zk_proofs as unknown[])
        : [];

      const predicateProofs = Array.isArray(presentationData.predicate_proofs)
        ? (presentationData.predicate_proofs as unknown[])
        : [];

      const evidenceList = Array.isArray(presentationData.evidence)
        ? (presentationData.evidence as Array<{ label: string; filename?: string; gateway_url?: string; ipfs_hash?: string; content_type?: string; size?: number }>)
        : [];

      const evidenceErrors = Array.isArray(presentationData.evidence_errors)
        ? (presentationData.evidence_errors as string[])
        : [];

      const holderPseudonym = typeof presentationData.holder_pseudonym === 'string'
        ? (presentationData.holder_pseudonym as string)
        : presentation.prover_pseudonym || null;

      const holderDid = typeof presentationData.holder_did === 'string'
        ? (presentationData.holder_did as string)
        : presentation.prover_did;

      const consentExpiresAt = typeof presentationData.consent_expires_at === 'string'
        ? (presentationData.consent_expires_at as string)
        : null;

      const extensions = Array.isArray(presentationData.extensions)
        ? (presentationData.extensions as unknown[])
            .filter((ext): ext is string => typeof ext === 'string' && ext.trim().length > 0)
        : [];

      return {
        success: verified,
        verified,
        message:
          status === 'verified'
            ? 'Presentation verified successfully'
            : status === 'rejected'
              ? 'Presentation was rejected'
              : 'Presentation is pending verification',
        credential: {
          name: credentialName,
          type: presentation.presentation_type
            ? [presentation.presentation_type]
            : ['VerifiablePresentation'],
          issuer: issuerDid,
          issuanceDate: presentation.created_at,
          credentialSubject: {
            id: holderPseudonym || holderDid,
            claims: filteredSelectedAttributes || {},
            extensions,
            ...(holderPseudonym ? { holder_pseudonym: holderPseudonym } : {}),
          },
        },
        verification: {
          ipfs_hash: ipfsHashResolved || queryParams.ipfsHash,
          issuer: issuerDid || 'Unknown Issuer',
          signature_valid: verified,
          on_chain: Boolean(presentationData.blockchain_reference || presentationData.blockchain_tx),
          blockchain_verified: Boolean(presentationData.blockchain_reference),
          timestamp: (presentation.verified_at as string | undefined) || presentation.created_at,
          metadata_uri: typeof presentationData.metadata_uri === 'string'
            ? (presentationData.metadata_uri as string)
            : null,
          ipfs_gateway_url: typeof presentationData.ipfs_gateway_url === 'string'
            ? (presentationData.ipfs_gateway_url as string)
            : null,
          blockchain_tx: typeof presentationData.blockchain_tx === 'string'
            ? (presentationData.blockchain_tx as string)
            : null,
          blockchain_reference: typeof presentationData.blockchain_reference === 'string'
            ? (presentationData.blockchain_reference as string)
            : null,
          warning: typeof presentationData.rejection_reason === 'string'
            ? (presentationData.rejection_reason as string)
            : null,
          provided_attributes: providedAttributes,
          revoked_attributes: revokedAttributes,
          credential_status: credentialStatus || null,
          selected_attributes: filteredSelectedAttributes || null,
          zk_proofs: zkProofs,
          predicate_proofs: predicateProofs,
          consent_expires_at: consentExpiresAt,
          evidence: evidenceList,
          evidence_errors: evidenceErrors,
          evidence_required: evidenceRequired,
          evidence_status: evidenceStatus,
          credential_id: typeof presentationData.credential_id === 'string'
            ? (presentationData.credential_id as string)
            : null,
          extensions,
        },
        holderLabel: holderPseudonym || holderDid || 'Anonymous holder',
        subjectDid: holderPseudonym ? null : holderDid || null,
      };
    },
    [queryParams.ipfsHash]
  );

  const normalizeDirectVerificationResponse = useCallback(
    (data: DirectVerificationResponse): VerificationResult => {
      const verification: VerificationApi = data.verification ?? {};
      const rawEvidence: EvidenceApi[] = Array.isArray(verification.evidence)
        ? (verification.evidence as EvidenceApi[])
        : Array.isArray(verification.evidence_attachments)
          ? (verification.evidence_attachments as EvidenceApi[])
          : [];

      const normalizedEvidence = rawEvidence.map((ev) => ({
        label: ev?.label ?? '',
        filename: ev?.filename ?? '',
        gateway_url: ev?.gateway_url ?? ev?.gatewayUrl ?? null,
        ipfs_hash: ev?.ipfs_hash ?? ev?.ipfsHash ?? undefined,
        content_type: ev?.content_type ?? ev?.contentType ?? null,
        size: typeof ev?.size === 'number' ? ev.size : ev?.size ? Number(ev.size) || undefined : undefined,
      }));

      const providedAttributesRaw = toStringArray(verification.provided_attributes);

      const revokedAttributes = toStringArray(verification.revoked_attributes);

      const revokedLookup = new Set(revokedAttributes.map(normalizeAttributeKey));
      const providedAttributes = providedAttributesRaw.filter(
        (attr) => !revokedLookup.has(normalizeAttributeKey(attr))
      );

      const requiredEvidence = toStringArray(verification.evidence_required);

      const evidenceStatus = toStringOrNull(verification.evidence_status);

      const credentialStatus = toStringOrUndefined(verification.credential_status) ?? (
        providedAttributes.length > 0
          ? 'active'
          : revokedAttributes.length > 0
            ? 'revoked'
            : null
      );

      const credential = { ...(data?.credential ?? {}) } as CredentialData;
      const directExtensions = Array.isArray(credential?.credentialSubject?.extensions)
        ? (credential.credentialSubject?.extensions as unknown[])
            .filter((ext): ext is string => typeof ext === 'string' && ext.trim().length > 0)
        : [];
      const verificationExtensions = Array.isArray(verification.extensions)
        ? (verification.extensions as unknown[])
            .filter((ext): ext is string => typeof ext === 'string' && ext.trim().length > 0)
        : [];
      const mergedExtensions = Array.from(new Set([...directExtensions, ...verificationExtensions]));

      if (credential?.credentialSubject?.claims && revokedAttributes.length > 0) {
        const claims = credential.credentialSubject.claims as Record<string, unknown>;
        const filteredClaims = Object.fromEntries(
          Object.entries(claims).filter(
            ([key]) => !revokedLookup.has(normalizeAttributeKey(key))
          )
        );
        credential.credentialSubject = {
          ...credential.credentialSubject,
          claims: filteredClaims,
          extensions: mergedExtensions,
        };
      } else if (credential?.credentialSubject) {
        credential.credentialSubject = {
          ...credential.credentialSubject,
          extensions: mergedExtensions,
        };
      } else if (mergedExtensions.length > 0) {
        credential.credentialSubject = {
          extensions: mergedExtensions,
        };
      }

      const ipfsHashValue = toStringOrUndefined(verification.ipfs_hash)
        ?? toStringOrUndefined(data?.ipfs_hash)
        ?? '';

      const issuerValue = toStringOrUndefined(verification.issuer)
        ?? (typeof credential.issuer === 'string' ? credential.issuer : undefined)
        ?? '';

      const timestampValue = toStringOrUndefined(verification.timestamp)
        ?? new Date().toISOString();

      const metadataUriValue = toStringOrNull(verification.metadata_uri);
      const ipfsGatewayValue = toStringOrNull(verification.ipfs_gateway_url);
      const blockchainTxValue = toStringOrNull(verification.blockchain_tx);
      const blockchainRefValue = toStringOrNull(verification.blockchain_reference);
      const warningValue = toStringOrNull(verification.warning);
      const consentExpiresValue = toStringOrNull(verification.consent_expires_at);
      const credentialIdValue = toStringOrNull(verification.credential_id);

      const zkProofsValue = Array.isArray(verification.zk_proofs)
        ? verification.zk_proofs
        : [];

      const predicateProofsValue = Array.isArray(verification.predicate_proofs)
        ? verification.predicate_proofs
        : [];

      const normalizedSelectedAttributes = (() => {
        if (
          verification.anonymous_proof &&
          typeof verification.anonymous_proof === 'object' &&
          verification.anonymous_proof !== null &&
          typeof (verification.anonymous_proof as Record<string, unknown>).revealed_attributes === 'object'
        ) {
          const revealed = (verification.anonymous_proof as { revealed_attributes?: Record<string, unknown> }).revealed_attributes ?? {};
          const masked = Object.fromEntries(
            Object.keys(revealed).map((key) => [key, 'verified via anonymous proof'])
          );
          return Object.keys(masked).length > 0 ? masked : null;
        }

        if (
          verification.selected_attributes &&
          typeof verification.selected_attributes === 'object' &&
          verification.selected_attributes !== null
        ) {
          const entries = Object.entries(verification.selected_attributes as Record<string, unknown>);
          const filtered = Object.fromEntries(
            entries.filter(([key]) => !revokedLookup.has(normalizeAttributeKey(key)))
          );
          return Object.keys(filtered).length > 0 ? filtered : null;
        }

        return null;
      })();

      const credentialSubjectId = credential.credentialSubject && typeof credential.credentialSubject === 'object'
        ? toStringOrUndefined((credential.credentialSubject as Record<string, unknown>).id)
        : undefined;

      const credentialSubjectPseudonym = credential.credentialSubject && typeof credential.credentialSubject === 'object'
        ? toStringOrUndefined((credential.credentialSubject as Record<string, unknown>).holder_pseudonym)
        : undefined;

      const verificationHolderPseudonym = toStringOrUndefined((verification as Record<string, unknown>).holder_pseudonym);
      const holderPseudonym = credentialSubjectPseudonym || verificationHolderPseudonym || null;

      const holderLabel = holderPseudonym || credentialSubjectId || 'Anonymous holder';
      const subjectDid = holderPseudonym ? null : credentialSubjectId || null;

      return {
        success: Boolean(data?.success ?? data?.verified),
        verified: Boolean(data?.verified ?? data?.success),
        credential,
        verification: {
          ...verification,
          ipfs_hash: ipfsHashValue,
          issuer: issuerValue,
          signature_valid: Boolean(verification.signature_valid ?? data?.verified ?? false),
          on_chain: Boolean(verification.on_chain),
          blockchain_verified: Boolean(verification.blockchain_verified),
          timestamp: timestampValue,
          metadata_uri: metadataUriValue,
          ipfs_gateway_url: ipfsGatewayValue,
          blockchain_tx: blockchainTxValue,
          blockchain_reference: blockchainRefValue,
          warning: warningValue,
          provided_attributes: providedAttributes,
          revoked_attributes: revokedAttributes,
          credential_status: credentialStatus,
          selected_attributes: normalizedSelectedAttributes,
          zk_proofs: zkProofsValue,
          predicate_proofs: predicateProofsValue,
          consent_expires_at: consentExpiresValue,
          evidence: normalizedEvidence,
          evidence_errors: Array.isArray(verification.evidence_errors)
            ? verification.evidence_errors as string[]
            : [],
          evidence_required: requiredEvidence,
          evidence_status: evidenceStatus,
          credential_id: credentialIdValue,
          extensions: mergedExtensions,
        },
        message:
          data?.message ??
          (Boolean(data?.verified ?? data?.success)
            ? 'Credential verified successfully'
            : 'Credential verification failed'),
        holderLabel,
        subjectDid,
      };
    },
    []
  );

  const verifyCredential = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let requestUrl: string;

      if (queryParams.presentationId && queryParams.verifierDid) {
        const encodedPresentationId = encodeURIComponent(queryParams.presentationId);
        requestUrl = `${apiBaseUrl}/api/verifier/presentations/${encodedPresentationId}`;
      } else {
        requestUrl = `${apiBaseUrl}/api/verifier/verify/ipfs/${ipfsHash}`;
      }

      const response = await fetch(requestUrl);

      if (!response.ok) {
        throw new Error('Failed to verify credential');
      }

      const data = await response.json();

      if (data.presentation) {
        const presentation = data.presentation as PresentationApi;
        const presentationData = presentation.presentation_data || {};

        const ipfsFromPresentation = typeof presentationData.ipfs_hash === 'string'
          ? (presentationData.ipfs_hash as string)
          : undefined;

        const normalizedResult = buildResultFromPresentation(presentation, ipfsFromPresentation);
        setResult(normalizedResult);

        const subjectId = normalizedResult.subjectDid;

        if (subjectId && !skipConsentCheck) {
          await checkConsentStatus(subjectId);
        }
      } else {
        const normalized = normalizeDirectVerificationResponse(data);
        setResult(normalized);

        if (normalized.subjectDid && !skipConsentCheck) {
          await checkConsentStatus(normalized.subjectDid);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Verification failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [
    apiBaseUrl,
    buildResultFromPresentation,
    checkConsentStatus,
    ipfsHash,
    normalizeDirectVerificationResponse,
    queryParams.presentationId,
    queryParams.verifierDid,
    skipConsentCheck,
  ]);

  useEffect(() => {
    if (ipfsHash) {
      verifyCredential();
    }
  }, [ipfsHash, queryParams.presentationId, queryParams.verifierDid, verifyCredential]);

  const evidenceProvided = result?.verification?.evidence ?? [];
  const evidenceRequired = result?.verification?.evidence_required ?? [];
  const missingEvidence = evidenceRequired.filter(
    (label) =>
      !evidenceProvided.some((ev) => (ev.label || '').toLowerCase() === (label || '').toLowerCase())
  );
  const evidenceStatus = result?.verification?.evidence_status ?? null;

  const extensions = useMemo(() => {
    const subjectExtensions = Array.isArray(result?.credential?.credentialSubject?.extensions)
      ? (result?.credential?.credentialSubject?.extensions as string[])
      : [];
    const verificationExtensions = Array.isArray(result?.verification?.extensions)
      ? (result?.verification?.extensions as string[])
      : [];

    return Array.from(new Set([...subjectExtensions, ...verificationExtensions]));
  }, [
    result?.credential?.credentialSubject?.extensions,
    result?.verification?.extensions,
  ]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/VerifierHome')} 
            className="flex items-center gap-2 text-dark-300 hover:text-dark-500 transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="font-medium">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary-500" />
            <h1 className="text-xl font-bold text-dark-500">Credential Verification</h1>
          </div>
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-dark-300 hover:text-dark-500 transition-colors"
          >
            <Home size={20} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <Loader2 className="w-16 h-16 text-primary-500 animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-dark-500 mb-2">Verifying Credential...</h2>
            <p className="text-dark-300">
              Fetching from IPFS and checking blockchain anchoring
            </p>
            {consentLoading && (
              <p className="text-sm text-blue-600 mt-2">
                Checking user consent on blockchain...
              </p>
            )}
            <div className="mt-6 text-sm text-dark-300 font-mono break-all bg-light-100 p-4 rounded-lg">
              <p className="text-xs text-dark-200 mb-1">IPFS Hash:</p>
              {ipfsHash}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-dark-500 mb-2">Verification Failed</h2>
            <p className="text-red-600 mb-6">{error}</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={verifyCredential}
                className="px-6 py-3 bg-primary-500 text-white rounded-full font-medium hover:bg-primary-600 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3 bg-light-200 text-dark-500 rounded-full font-medium hover:bg-light-200 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Failure State */}
        {result && !loading && !result.verified && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-dark-500 mb-2">Verification Failed</h2>
            <p className="text-red-600 mb-6">{result.message || 'Credential verification failed. Attributes may not match requirements.'}</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  const reason = result.message || 'Credential verification failed';
                  router.push(`/VerificationRejected?reason=${encodeURIComponent(reason)}`);
                }}
                className="px-6 py-3 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors"
              >
                View Failure Details
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3 bg-light-200 text-dark-500 rounded-full font-medium hover:bg-light-200 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Success State */}
        {result && !loading && result.verified && (
          <div className="space-y-6">
            {/* Verification Status */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-dark-500 mb-2">
                    Credential Verified
                  </h2>
                  <p className="text-dark-300 mb-4">{result.message}</p>
                  
                  {/* Verification Badges */}
                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-full flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-900">Signature Valid</span>
                    </div>
                    {result.verification.on_chain && (
                      <div className="px-4 py-2 bg-purple-50 border border-purple-200 rounded-full flex items-center gap-2">
                        <Shield className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-900">Blockchain Anchored</span>
                      </div>
                    )}
                    {result.verification.credential_status === 'revoked' && (
                      <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-full flex items-center gap-2 text-red-700">
                        <TriangleAlert className="w-4 h-4" />
                        <span className="text-sm font-medium">Credential Revoked</span>
                      </div>
                    )}
                    {result.verification.credential_status === 'expired' && (
                      <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-full flex items-center gap-2 text-amber-700">
                        <Hourglass className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Consent expired
                          {result.verification.consent_expires_at && (
                            <span className="ml-2 text-xs text-amber-600">
                              {new Date(result.verification.consent_expires_at).toLocaleString()}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  {(result.verification.ipfs_gateway_url || result.verification.ipfs_hash || result.verification.blockchain_tx) && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {(result.verification.ipfs_gateway_url || result.verification.ipfs_hash) && (
                        <a
                          href={
                            result.verification.ipfs_gateway_url ||
                            `https://gateway.sphyre.tech/ipfs/${result.verification.ipfs_hash}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 border border-blue-200 rounded-full text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View on IPFS
                        </a>
                      )}

                      {result.verification.blockchain_tx && (
                        <a
                          href={`https://sepolia.basescan.org/tx/${result.verification.blockchain_tx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 border border-purple-200 rounded-full text-sm text-purple-700 bg-purple-50 hover:bg-purple-100 transition"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View on BaseScan
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Consent Status */}
            {consentValid !== null && (
              <div
                className={`bg-white rounded-2xl shadow-lg p-8 border-2 ${
                  consentValid ? 'border-green-200' : 'border-yellow-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    consentValid ? 'bg-green-100' : 'bg-yellow-100'
                  }`}>
                    {consentValid ? (
                      <ShieldCheck className="w-7 h-7 text-green-600" />
                    ) : (
                      <ShieldAlert className="w-7 h-7 text-yellow-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-dark-500 mb-2">
                      {consentValid ? 'Standing Consent Active' : 'No Standing Consent Recorded'}
                    </h3>
                    <p className={`text-sm ${consentValid ? 'text-green-700' : 'text-yellow-700'}`}>
                      {consentValid 
                        ? 'User has an active standing consent for credential_verification'
                        : 'This presentation is valid, but there is no ongoing consent on record for future verifications.'
                      }
                    </p>
                    {!consentValid && consentError && (
                      <p className="text-xs text-yellow-600 mt-2">
                        {consentError}
                      </p>
                    )}
                    <div className={`mt-3 px-3 py-2 rounded-lg ${
                      consentValid ? 'bg-green-50' : 'bg-yellow-50'
                    }`}>
                      <p className="text-xs text-dark-400 mt-1">
                        <strong>Checked on:</strong> Base Sepolia blockchain
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {extensions.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-indigo-100">
                <h3 className="text-lg font-bold text-dark-500 mb-3">Extensions Included</h3>
                <p className="text-sm text-dark-300 mb-4">
                  The following extensions were embedded in this credential.
                </p>
                <div className="flex flex-wrap gap-2">
                  {extensions.map((ext) => (
                    <span
                      key={ext}
                      className="px-3 py-1 bg-indigo-50 text-indigo-700 text-sm rounded-full border border-indigo-200"
                    >
                      {ext}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(result.verification?.provided_attributes) &&
              result.verification.provided_attributes.length > 0 && (
                <div className="bg-light-100 rounded-2xl shadow-lg p-8">
                  <h3 className="text-lg font-bold text-dark-500 mb-4">Provided Attributes</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.verification.provided_attributes.map((attr: string) => (
                      <span
                        key={attr}
                        className="px-3 py-1 bg-[#16312b] text-[#7EE0AC] text-sm rounded-full border border-green-700/30"
                      >
                        {attr}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {(evidenceProvided.length > 0 || evidenceRequired.length > 0) && (
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-blue-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-dark-500">Supporting Evidence</h3>
                    <p className="text-sm text-dark-300">
                      Holder provided the following evidence files alongside the credential.
                    </p>
                  </div>
                  {evidenceStatus && (
                    <span className="text-xs px-3 py-1 rounded-full bg-light-200 text-dark-400 font-medium">
                      Status: {evidenceStatus}
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {evidenceProvided.map((ev, idx) => (
                    <div
                      key={`${ev.ipfs_hash || ev.filename || idx}`}
                      className="flex items-center justify-between gap-4 bg-light-100 border border-light-200 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <FileText className="w-5 h-5 text-primary-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-dark-500">
                            {ev.label || ev.filename || 'Evidence file'}
                          </p>
                          <p className="text-xs text-dark-300">
                            {ev.filename || 'Unnamed file'}
                          </p>
                          <p className="text-xs text-dark-300 mt-1">
                            {ev.content_type || 'Unknown type'}
                            {typeof ev.size === 'number' && ev.size > 0 && (
                              <span className="ml-2">
                                {formatBytes(ev.size)}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {ev.gateway_url && (
                          <a
                            href={ev.gateway_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100"
                          >
                            <LinkIcon className="w-4 h-4" />
                            Open
                          </a>
                        )}
                        {!ev.gateway_url && ev.ipfs_hash && (
                          <a
                            href={`https://gateway.sphyre.tech/ipfs/${ev.ipfs_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100"
                          >
                            <LinkIcon className="w-4 h-4" />
                            IPFS
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {missingEvidence.length > 0 && (
                  <div className="mt-4 p-3 border border-amber-200 bg-amber-50 rounded-lg">
                    <p className="text-xs text-amber-700 font-semibold mb-2">
                      Missing required evidence
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-amber-700">
                      {missingEvidence.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {Array.isArray(result.verification?.evidence_errors) && result.verification.evidence_errors.length > 0 && (
              <div className="bg-red-50 rounded-2xl shadow-lg p-8 border border-red-200">
                <h3 className="text-lg font-bold text-red-800 mb-3">Evidence Issues</h3>
                <ul className="list-disc pl-5 space-y-2 text-sm text-red-700">
                  {result.verification.evidence_errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(result.verification?.revoked_attributes) &&
              result.verification.revoked_attributes.length > 0 && (
                <div className="bg-red-50 rounded-2xl shadow-lg p-8 border border-red-200">
                  <h3 className="text-lg font-bold text-red-800 mb-4">Revoked Attributes</h3>
                  <p className="text-sm text-red-700 mb-4">
                    These attributes are no longer valid because the holder revoked consent for this credential.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.verification.revoked_attributes.map((attr: string) => (
                      <span
                        key={attr}
                        className="px-3 py-1 bg-white text-red-600 text-sm rounded-full border border-red-300 line-through"
                      >
                        {attr}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {/* Credential Subject */}
            {result.credential.credentialSubject && (
                <div className="mb-6">
                  <p className="text-xs text-dark-300 mb-3">Credential Claims</p>
                  <div className="space-y-3">
                    {Object.entries(result.credential.credentialSubject.claims || {}).map(([key, value]) => (
                      <div key={key} className="p-3 bg-light-100 rounded-lg border border-gray-100">
                        <p className="text-xs text-dark-300 mb-1 capitalize">{key.replace(/_/g, ' ')}</p>
                        <p className="text-sm font-medium text-dark-500">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Issuance Date */}
            {result.credential.issuanceDate && (
                <div className="p-3 bg-light-100 rounded-lg border border-gray-100">
                  <p className="text-xs text-dark-300 mb-1">Issued On</p>
                  <p className="text-sm font-medium text-dark-500">
                    {new Date(result.credential.issuanceDate).toLocaleString()}
                  </p>
                </div>
              )}
            {/* Verifier Actions */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-100">
              <h3 className="text-lg font-bold text-dark-500 mb-3">Verification Complete</h3>
              <p className="text-sm text-dark-300 mb-4">
                This credential has been successfully verified. You may proceed with your verification workflow.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => router.push('/')}
                  className="flex-1 px-6 py-3 bg-primary-500 text-white rounded-full font-medium hover:bg-primary-600 transition-colors inline-flex items-center justify-center gap-2"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    alert('Verification link copied to clipboard!');
                  }}
                  className="px-6 py-3 bg-white text-dark-500 rounded-full font-medium hover:bg-light-100 transition-colors border border-dark-100"
                >
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}