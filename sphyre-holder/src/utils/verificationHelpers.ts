// Helper functions for verification success handling

export interface VerificationSuccessData {
  credential_id: string;
  credential_type: string;
  verifier_name?: string;
  verifier_did?: string;
  verified_at: string;
  attributes_shared?: string[];
}

export interface VerificationFailureData {
  credential_id?: string;
  credential_type?: string;
  verifier_name?: string;
  verifier_did?: string;
  failed_at: string;
  reason?: string;
  error_code?: string | null;
  details?: unknown;
}

export const storeVerificationFailure = (data: VerificationFailureData): void => {
  sessionStorage.setItem('verification_failure', JSON.stringify(data));
  sessionStorage.removeItem('verification_success');
};

export const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const navigateToVerificationSuccess = (
  router: { push: (path: string) => void },
  data: VerificationSuccessData
): void => {
  sessionStorage.setItem('verification_success', JSON.stringify(data));
  router.push('/VerificationSuccess');
};

export const buildFailureData = (
  base: Omit<VerificationFailureData, 'failed_at'>,
  payload?: {
    reason?: string;
    error_code?: string | null;
    details?: unknown;
  },
  fallbackReason = 'Verification failed'
): VerificationFailureData => {
  return {
    ...base,
    failed_at: new Date().toISOString(),
    reason: payload?.reason || fallbackReason,
    error_code: payload?.error_code ?? null,
    details: payload?.details,
  };
};

export const simulateVerificationSuccess = (
  credential: {
    id: string;
    credential_type: string;
    credential_preview?: Record<string, unknown>;
  },
  verifierInfo?: {
    name?: string;
    did?: string;
  }
): VerificationSuccessData => {
  const attributes = credential.credential_preview
    ? Object.keys(credential.credential_preview)
    : [];

  return {
    credential_id: credential.id,
    credential_type: credential.credential_type,
    verifier_name: verifierInfo?.name || 'In-Person Verifier',
    verifier_did: verifierInfo?.did,
    verified_at: new Date().toISOString(),
    attributes_shared: attributes,
  };
};
