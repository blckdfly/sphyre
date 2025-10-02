export type ConsentScopeItem = {
  id: string; // e.g., claim or attribute name
  label: string; // human label to show
};

export type ConsentRecord = {
  id: string; // unique id
  requesterId: string; // e.g., DID or domain
  requesterName: string;
  purpose: string;
  scope: ConsentScopeItem[];
  createdAt: number; // epoch ms
  expiresAt?: number; // epoch ms
  active: boolean;
};

const STORAGE_KEY = 'sphyre.consents.v1';

function readAll(): ConsentRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ConsentRecord[];
    return arr.map((c) => ({ ...c, active: c.active !== false }));
  } catch {
    return [];
  }
}

function writeAll(consents: ConsentRecord[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consents));
}

export function listConsents(): ConsentRecord[] {
  // Auto-mark expired consents as inactive on read
  const now = Date.now();
  const arr = readAll();
  let changed = false;
  const updated = arr.map((c) => {
    if (c.active && c.expiresAt && c.expiresAt < now) {
      changed = true;
      return { ...c, active: false };
    }
    return c;
  });
  if (changed) writeAll(updated);
  return updated.sort((a, b) => b.createdAt - a.createdAt);
}

export function upsertConsent(consent: ConsentRecord) {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === consent.id);
  if (idx >= 0) {
    all[idx] = consent;
  } else {
    all.push(consent);
  }
  writeAll(all);
}

export function revokeConsent(id: string) {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx >= 0) {
    all[idx].active = false;
    writeAll(all);
  }
}

export function deleteConsent(id: string) {
  const all = readAll().filter((c) => c.id !== id);
  writeAll(all);
}

export function purgeExpiredConsents(): number {
  const now = Date.now();
  const all = readAll();
  const kept = all.filter((c) => !(c.expiresAt && c.expiresAt < now));
  writeAll(kept);
  return all.length - kept.length;
}

export function revokeAllActive(): number {
  const all = readAll();
  let changed = 0;
  const updated = all.map((c) => {
    if (c.active) {
      changed++;
      return { ...c, active: false };
    }
    return c;
  });
  if (changed > 0) writeAll(updated);
  return changed;
}

export function findActiveConsentByRequesterAndScope(
  requesterId: string,
  scopeIds: string[]
): ConsentRecord | undefined {
  const now = Date.now();
  return readAll().find((c) => {
    if (!c.active) return false;
    if (c.requesterId !== requesterId) return false;
    if (c.expiresAt && c.expiresAt < now) return false;
    const ids = new Set(c.scope.map((s) => s.id));
    // require that requested scope is fully covered by consent
    return scopeIds.every((id) => ids.has(id));
  });
}
