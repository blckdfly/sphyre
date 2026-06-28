'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CheckCircle2, ChevronLeft, FileText, Shield } from 'lucide-react';

function VerificationSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const presentationData = typeof window !== 'undefined'
    ? JSON.parse(sessionStorage.getItem('presentation_data') || '{}')
    : {};

  const storedHolderLabel = typeof window !== 'undefined'
    ? sessionStorage.getItem('verifier_last_holder_label') || sessionStorage.getItem('verifier_active_holder_label')
    : null;

  const normalizeAttributeKey = (value: string) =>
    typeof value === 'string' ? value.trim().replace(/[\s_-]+/g, '').toLowerCase() : '';

  const revokedAttributes = Array.isArray(presentationData.revoked_attributes)
    ? (presentationData.revoked_attributes as string[])
    : [];
  const revokedLookup = new Set(revokedAttributes.map(normalizeAttributeKey));

  const attributes = (() => {
    const maskAnonymousValues = (keys: string[]) =>
      Object.fromEntries(
        keys
          .filter((key) => !revokedLookup.has(normalizeAttributeKey(key)))
          .map((key) => [key, 'verified via anonymous proof'])
      );

    if (
      presentationData.anonymous_proof &&
      typeof presentationData.anonymous_proof === 'object' &&
      presentationData.anonymous_proof !== null
    ) {
      const revealed = (presentationData.anonymous_proof as { revealed_attributes?: Record<string, unknown> }).revealed_attributes;
      if (revealed && typeof revealed === 'object' && !Array.isArray(revealed)) {
        return maskAnonymousValues(Object.keys(revealed));
      }
    }

    if (
      presentationData.anonymous_revealed_attributes &&
      typeof presentationData.anonymous_revealed_attributes === 'object' &&
      !Array.isArray(presentationData.anonymous_revealed_attributes)
    ) {
      return maskAnonymousValues(Object.keys(presentationData.anonymous_revealed_attributes));
    }

    if (
      presentationData.selected_attributes &&
      typeof presentationData.selected_attributes === 'object' &&
      !Array.isArray(presentationData.selected_attributes)
    ) {
      return Object.fromEntries(
        Object.entries(presentationData.selected_attributes as Record<string, unknown>).filter(
          ([key]) => !revokedLookup.has(normalizeAttributeKey(key))
        )
      );
    }

    return {};
  })();
  const predicateProofsRaw: unknown[] = (() => {
    if (Array.isArray(presentationData.predicate_proofs)) {
      return presentationData.predicate_proofs;
    }
    if (Array.isArray(presentationData.predicateProofs)) {
      return presentationData.predicateProofs;
    }
    if (Array.isArray(presentationData.zk_proofs)) {
      return presentationData.zk_proofs;
    }
    return [];
  })();

  const humanizeAttribute = (value: string) => value.replace(/[_-]+/g, ' ').trim();
  const formatOperator = (operator: string) => {
    const displayMap: Record<string, string> = {
      '>=': '≥',
      '<=': '≤',
      '!=': '≠',
    };
    return displayMap[operator] ?? operator;
  };

  type PredicateProofSummary = {
    id: string;
    attributeLabel: string;
    description: string;
  };

  type PredicateProofRecord = {
    attribute_name?: unknown;
    predicate_type?: unknown;
    predicate_value?: unknown;
  };

  const predicateProofSummaries: PredicateProofSummary[] = predicateProofsRaw.flatMap(
    (item: unknown, index: number) => {
      if (!item || typeof item !== 'object') {
        return [];
      }

      const proof = item as PredicateProofRecord;
      const attributeName =
        typeof proof.attribute_name === 'string' ? proof.attribute_name : '';
      const operatorRaw =
        typeof proof.predicate_type === 'string' ? proof.predicate_type : '';
      const valueRaw = proof.predicate_value;
      const predicateValue =
        typeof valueRaw === 'number' || typeof valueRaw === 'string'
          ? valueRaw.toString()
          : '';

      if (!attributeName && !operatorRaw && !predicateValue) {
        return [];
      }

      const attributeLabel =
        attributeName !== ''
          ? humanizeAttribute(attributeName)
          : `Predicate ${index + 1}`;
      const operatorDisplay = formatOperator(operatorRaw || '?');
      const summary = `${attributeLabel} ${operatorDisplay} ${predicateValue || '?'}`;

      return [
        {
          id: `${normalizeAttributeKey(attributeName || summary)}-${index}`,
          attributeLabel,
          description: summary,
        },
      ];
    }
  );

  const attributeEntries = Object.entries(attributes);
  const holderLabel =
    presentationData.holder_pseudonym ||
    presentationData.holder_label ||
    presentationData.holder_did ||
    storedHolderLabel ||
    'Anonymous holder';

  const ipfsHash = presentationData.ipfs_hash || presentationData.ipfsHash;
  const ipfsGateway = presentationData.ipfs_gateway_url || presentationData.ipfsGatewayUrl;
  const credentialRef = presentationData.credential_id || presentationData.credentialId;
  const showIpfsButton = Boolean(ipfsHash && credentialRef && ipfsGateway);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 to-emerald-600">
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
        {/* Success Icon */}
        <div className="w-32 h-32 bg-white/20 backdrop-blur-lg rounded-full flex items-center justify-center mb-8 animate-pulse">
          <CheckCircle2 size={80} className="text-white" />
        </div>
        
        {/* Title */}
        <h1 className="text-4xl font-bold mb-4 text-center">Verification Successful!</h1>
        <p className="text-green-100 text-lg mb-8 text-center max-w-md">
          The holder has approved your verification request and shared their credentials.
        </p>
        
        {/* Holder Info */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 mb-6 max-w-md w-full">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm text-green-100">Holder:</p>
          </div>
          <p className="font-mono text-xs break-all">{holderLabel}</p>
        </div>

        {/* Presentation Data */}
        {(attributeEntries.length > 0 || predicateProofSummaries.length > 0) && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 max-w-md w-full">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={20} />
              <h2 className="font-semibold text-lg">Attributes Shared</h2>
            </div>

            {attributeEntries.length > 0 && (
              <div className="space-y-3">
                {attributeEntries.map(([key, value]) => (
                  <div key={key} className="bg-white/10 rounded-lg p-3">
                    <p className="text-sm text-green-100 mb-1 capitalize">
                      {key.replace(/_/g, ' ')}
                    </p>
                    <p className="font-mono text-sm break-all">{String(value)}</p>
                  </div>
                ))}
              </div>
            )}

            {predicateProofSummaries.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-green-200" />
                  <p className="text-sm text-green-100">
                    {predicateProofSummaries.length} Zero-Knowledge Predicate
                    {predicateProofSummaries.length > 1 ? 's' : ''} Verified
                  </p>
                </div>

                <div className="space-y-3">
                  {predicateProofSummaries.map((proof: PredicateProofSummary) => (
                    <div key={proof.id} className="bg-white/10 rounded-lg p-3">
                      <p className="text-sm text-green-100 mb-1 capitalize">
                        {proof.attributeLabel}
                      </p>
                      <p className="font-mono text-sm break-all">
                        {`${proof.description} (ZK proof)`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Actions */}
        <div className="space-y-3 w-full max-w-md">
          <button
            onClick={() => router.push('/VerifierActivity')}
            className="w-full px-6 py-4 bg-white text-green-600 rounded-full font-medium hover:bg-green-50 transition-colors shadow-lg"
          >
            View Activity Log
          </button>

          {showIpfsButton && (
            <button
              onClick={() => router.push(`/verify/${ipfsHash}`)}
              className="w-full px-6 py-4 bg-white/20 hover:bg-white/30 rounded-full transition-colors backdrop-blur-sm border border-white/30"
            >
              Audit Credential on IPFS
            </button>
          )}

          <button
            onClick={() => router.push('/VerifierHome')}
            className="w-full px-6 py-4 bg-white/20 hover:bg-white/30 rounded-full transition-colors backdrop-blur-sm"
          >
            Verify Another Credential
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerificationSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin h-12 w-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    }>
      <VerificationSuccessContent />
    </Suspense>
  );
}
