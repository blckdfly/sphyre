import { ConsentScopeItem } from '@/lib/consent';

export type CurrentCredentialRequest = {
  requesterId: string;
  requesterName: string;
  requestedScope: ConsentScopeItem[];
  purposeHint?: string;
  selectedCredentialId?: string;
};

const KEY = 'sphyre.currentRequest.v1';

export function setCurrentRequest(req: CurrentCredentialRequest) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify(req));
}

export function getCurrentRequest(): CurrentCredentialRequest | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as CurrentCredentialRequest;
  } catch {
    return undefined;
  }
}

export function setSelectedCredentialId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(KEY);
    const current = raw ? (JSON.parse(raw) as CurrentCredentialRequest) : undefined;
    if (!current) return;
    const updated: CurrentCredentialRequest = { ...current, selectedCredentialId: id };
    sessionStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function clearCurrentRequest() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}
