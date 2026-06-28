'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trash2, RotateCcw, ShieldCheck, Loader2, ChevronDown } from 'lucide-react';
import { ConsentRecord, removeConsentLocally, listConsents, revokeConsent as localRevokeConsent, purgeExpiredConsents, revokeAllActive } from '@/lib/consent';
import walletService from '@/services/walletService';
import apiService from '@/services/apiService';
import { useToast } from '@/contexts/ToastContext';

interface BackendConsent {
  id: string;
  verifier_did: string;
  purpose: string;
  data_categories: string[];
  created_at: string;
  expires_at?: string;
  revoked: boolean;
}

export default function ConsentManagementPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  const [blockchainLoading, setBlockchainLoading] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Map<string, Set<string>>>(new Map());

  const labelCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    setSelectedAttributes(prev => {
      const updated = new Map(prev);
      let changed = false;
      Array.from(updated.keys()).forEach((key) => {
        if (!consents.find(c => c.id === key)) {
          updated.delete(key);
          changed = true;
        }
      });

      consents.forEach(consent => {
        const attrIds = consent.scope.map(attr => attr.id);
        const existing = updated.get(consent.id);
        const needsInit = !existing || existing.size !== attrIds.length || attrIds.some(id => !existing.has(id));
        if (needsInit) {
          updated.set(consent.id, new Set(attrIds));
          changed = true;
        }
      });

      return changed ? updated : prev;
    });
  }, [consents]);

  const resolveVerifierLabel = async (verifierDid: string, fallback?: string): Promise<string> => {
    const fallbackLabel =
      (fallback && fallback.trim().length > 0 ? fallback.trim() : undefined) ||
      (verifierDid ? verifierDid.split(':').pop() || verifierDid : 'Verifier');

    if (!verifierDid) {
      return fallbackLabel;
    }

    const cached = labelCacheRef.current[verifierDid];
    if (cached) {
      return cached;
    }

    try {
      const response = await apiService.getVerifierInfo(verifierDid);
      if (response.success && response.data) {
        const dataObj = response.data as Record<string, unknown>;
        const verifierObj = (dataObj.verifier as Record<string, unknown>) || dataObj;
        const typedVerifier = verifierObj as { organization?: string; name?: string };
        const organization =
          typeof typedVerifier.organization === 'string' ? typedVerifier.organization.trim() : '';
        const name = typeof typedVerifier.name === 'string' ? typedVerifier.name.trim() : '';
        const resolved = organization || name || fallbackLabel;
        labelCacheRef.current[verifierDid] = resolved;
        return resolved;
      }
    } catch (error) {
      console.warn('Failed to fetch verifier info for consent', verifierDid, error);
    }

    labelCacheRef.current[verifierDid] = fallbackLabel;
    return fallbackLabel;
  };

  const enrichConsents = useCallback(async (records: ConsentRecord[]): Promise<ConsentRecord[]> => {
    if (!records || records.length === 0) {
      return records;
    }

    const uniqueDids = Array.from(
      new Set(
        records
          .map((record) => record.requesterId)
          .filter((did): did is string => typeof did === 'string' && did.length > 0),
      ),
    );

    const labelPairs = await Promise.all(
      uniqueDids.map(async (did) => {
        const fallbackName =
          records.find((record) => record.requesterId === did)?.requesterName ||
          did.split(':').pop() ||
          did;
        const label = await resolveVerifierLabel(did, fallbackName);
        return [did, label] as const;
      }),
    );

    const labelMap = Object.fromEntries(labelPairs);

    return records.map((record) => ({
      ...record,
      requesterName: labelMap[record.requesterId] || record.requesterName,
    }));
  }, []);

  const refresh = useCallback(async () => {
    const localConsents = listConsents();

    try {
      const userDID = localStorage.getItem('userDID') || walletService.getCurrentDID();
      if (userDID) {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';
        const encodedDID = encodeURIComponent(userDID);
        const response = await fetch(`${API_URL}/api/wallet/${encodedDID}/consents`, {
          headers: {
            'X-User-DID': userDID,
          },
        });

        if (response.ok) {
          const result = await response.json();
          if (result.consents && Array.isArray(result.consents)) {
            const backendConsents = (result.consents as BackendConsent[]).map((c) => ({
              id: c.id,
              requesterId: c.verifier_did,
              requesterName: c.verifier_did.split(':').pop() || 'Unknown',
              purpose: c.purpose,
              scope: c.data_categories.map((cat) => ({
                id: cat,
                label: cat,
              })),
              createdAt: new Date(c.created_at).getTime(),
              expiresAt: c.expires_at ? new Date(c.expires_at).getTime() : undefined,
              active: !c.revoked,
              origin: 'backend' as const,
            }));

            const enrichedBackendConsents = await enrichConsents(backendConsents);
            setConsents(enrichedBackendConsents);
            console.log('Loaded', backendConsents.length, 'consents from backend');
            return;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to fetch consents from backend, using local:', error);
    }

    const enrichedLocalConsents = await enrichConsents(localConsents);
    setConsents(enrichedLocalConsents);
  }, [enrichConsents]);

  useEffect(() => {
    setMounted(true);
    refresh();
  }, [refresh]);

  const handleBack = () => {
    router.push('/SSIWalletIdentity');
  };

  const handleRevoke = async (id: string) => {
    const consent = consents.find(c => c.id === id);
    if (!consent) return;

    let confirmMsg = 'Revoke entire consent?';
    const selectedAttrs = selectedAttributes.get(id);
    if (selectedAttrs && selectedAttrs.size > 0) {
      const attrCount = selectedAttrs.size;
      confirmMsg = `Revoke ${attrCount} attribute(s)?`;
    }

    if (!confirm(confirmMsg)) return;

    setBlockchainLoading(id);

    try {
      const userDID = localStorage.getItem('userDID') || walletService.getCurrentDID();
      if (!userDID) {
        throw new Error('User DID not found');
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

      const body: { holder_did: string; revoke_attributes?: string[] } = { holder_did: userDID };
      if (selectedAttrs && selectedAttrs.size > 0) {
        body.revoke_attributes = Array.from(selectedAttrs);
      }

      addToast(selectedAttrs && selectedAttrs.size > 0 ? 'Revoking attributes...' : 'Revoking consent...', 'info');
      const encodedDID = encodeURIComponent(userDID);
      const response = await fetch(
        `${API_URL}/api/wallet/${encodedDID}/consents/${id}/revoke`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-DID': userDID,
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to revoke consent' }));
        throw new Error(error.error || `Server error: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        const msg = result.revoke_type === 'partial'
          ? `${result.revoked_attributes?.length || 0} attribute(s) revoked`
          : 'Consent revoked successfully';
        addToast(msg, 'success');

        if (result.tx_hash) {
          addToast(`On-chain tx: ${result.tx_hash}`, 'info');
        }

        const remainingAttributes: string[] | undefined = Array.isArray(result.remaining_attributes)
          ? result.remaining_attributes
          : undefined;

        if (result.revoke_type === 'full') {
          localRevokeConsent(id);
        }

        setConsents(prevConsents =>
          prevConsents.map(c => {
            if (c.id !== id) return c;

            const updatedScope = result.revoke_type === 'full'
              ? []
              : (remainingAttributes
                ? c.scope.filter(attr => remainingAttributes.includes(attr.id))
                : c.scope);

            return {
              ...c,
              active: result.revoke_type === 'full' ? false : c.active,
              scope: updatedScope,
            };
          })
        );

        setSelectedAttributes(prev => {
          const newMap = new Map(prev);
          if (result.revoke_type === 'full') {
            newMap.delete(id);
          } else if (remainingAttributes) {
            newMap.set(id, new Set(remainingAttributes));
          }
          return newMap;
        });
        setExpandedId(null);

        try {
          await refresh();
        } catch (refreshError) {
          console.warn('Failed to refresh consents from backend:', refreshError);
        }
      } else {
        throw new Error(result.message || 'Failed to revoke consent');
      }
    } catch (error) {
      console.error('Error revoking consent:', error);
      addToast(
        error instanceof Error ? error.message : 'Failed to revoke consent',
        'error'
      );
    } finally {
      setBlockchainLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    const consent = consents.find((c) => c.id === id);
    if (!consent) return;

    const isBackend = consent.origin === 'backend';
    const isFullyRevoked = !consent.active && consent.scope.length === 0;

    if (isBackend && !isFullyRevoked) {
      addToast('Revoke all attributes before deleting this consent.', 'error');
      return;
    }

    if (!confirm('Permanently delete this consent record?')) {
      return;
    }

    if (!isBackend) {
      removeConsentLocally(id);
      setConsents((prev) => prev.filter((c) => c.id !== id));
      return;
    }

    try {
      setDeletingId(id);
      const userDID = localStorage.getItem('userDID') || walletService.getCurrentDID();
      if (!userDID) {
        throw new Error('User DID not found');
      }

      const response = await apiService.deleteConsent(userDID, id);
      if (!response.success) {
        throw new Error(response.error || 'Server error deleting consent');
      }

      addToast('Consent deleted', 'success');
      await refresh();
    } catch (error) {
      console.error('Error deleting consent:', error);
      addToast(
        error instanceof Error ? error.message : 'Failed to delete consent',
        'error'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const formatted = useMemo(() => {
    const now = Date.now();
    return consents.map(c => {
      const expired = !!(c.expiresAt && c.expiresAt < now);
      return {
        ...c,
        created: new Date(c.createdAt).toLocaleString(),
        expiry: c.expiresAt ? new Date(c.expiresAt).toLocaleString() : 'None',
        expired,
        active: c.active && !expired,
      };
    });
  }, [consents]);

  const visible = useMemo(() => {
    if (!showActiveOnly) return formatted;
    return formatted.filter((c) => c.active && !c.expired);
  }, [formatted, showActiveOnly]);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-light-50">
        <p className="text-dark-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-light-50 flex flex-col">
      {/* Header */}
      <div className="bg-light-50 px-4 py-4 flex items-center">
        <button onClick={handleBack} className="mr-3">
          <ChevronLeft size={24} className="text-dark-300" />
        </button>
        <h1 className="text-lg font-medium text-dark-500">Consent Management</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {formatted.length === 0 ? (
          <div className="text-center text-dark-300 mt-16">
            <ShieldCheck className="mx-auto mb-4 text-dark-200" />
            <p>No saved consents yet.</p>
            <p className="text-sm text-dark-300 mt-1">Consents you save will appear here.</p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="mb-6 space-y-3">
              <label className="inline-flex items-center gap-2 text-sm text-dark-500">
                <input type="checkbox" className="w-4 h-4" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)} />
                Show active only
              </label>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => {
                  const removed = purgeExpiredConsents();
                  if (removed > 0) addToast(`${removed} expired consent(s) removed`, 'success');
                  refresh();
                }} className="text-xs px-3 py-2 rounded-lg bg-light-200 hover:bg-light-300 text-dark-500 transition">
                  Clear expired
                </button>
                <button onClick={() => {
                  if (confirm('Revoke all active consents?')) {
                    const n = revokeAllActive();
                    if (n > 0) addToast(`${n} consent(s) revoked`, 'success');
                    refresh();
                  }
                }} className="text-xs px-3 py-2 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 transition">
                  Revoke all active
                </button>
              </div>
            </div>

            {/* Consents List */}
            <div className="space-y-4">
              {visible.map((c) => (
                <div key={c.id} className="bg-white border border-dark-100 rounded-xl">
                  {/* Header */}
                  <div className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-dark-500">{c.requesterName}</p>
                        <p className="text-xs text-dark-300 truncate">{c.requesterId}</p>
                      </div>
                      <span
                        className={`inline-flex items-center justify-center text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap self-start sm:self-auto ${c.expired ? 'bg-red-100 text-red-700' : c.active ? 'bg-green-100 text-green-700' : 'bg-light-200 text-dark-300'}`}
                      >
                        {c.expired ? 'Expired' : c.active ? 'Active' : 'Revoked'}
                      </span>
                    </div>
                    <p className="text-sm text-dark-500">{c.purpose}</p>
                  </div>

                  {/* Details */}
                  <div className="px-4 py-3 bg-light-50 ">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-dark-300">Created</p>
                        <p className="text-dark-500 font-medium">{c.created}</p>
                      </div>
                      <div>
                        <p className="text-dark-300">Expires</p>
                        <p className="text-dark-500 font-medium">{c.expiry}</p>
                      </div>
                    </div>
                  </div>

                  {/* Attributes */}
                  <div className="p-4">
                    <p className="text-xs text-dark-300 mb-2 font-medium">Data Scope ({c.scope.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {c.scope.map(s => (
                        <span key={s.id} className="text-xs bg-blue-50 text-primary-600 px-2 py-1 rounded-full">
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Expandable Partial Revoke Section */}
                  {c.active && !c.expired && (
                    <>
                      <button
                        onClick={() => {
                          if (expandedId === c.id) {
                            setExpandedId(null);
                          } else {
                            setExpandedId(c.id);
                          }
                        }}
                        className="w-full px-4 py-3 flex items-center justify-between text-sm text-primary-600 hover:bg-light-50 transition"
                      >
                        <span>Revoke specific attributes</span>
                        <ChevronDown size={16} className={`transition ${expandedId === c.id ? 'rotate-180' : ''}`} />
                      </button>

                      {expandedId === c.id && (
                        <div className="px-4 py-3 bg-light-50 border-t border-dark-50 space-y-3">
                          <div className="space-y-2">
                            {c.scope.map(attr => (
                              <label key={attr.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedAttributes.get(c.id)?.has(attr.id) || false}
                                  onChange={(e) => {
                                    const newMap = new Map(selectedAttributes);
                                    const set = newMap.get(c.id) || new Set();
                                    if (e.target.checked) {
                                      set.add(attr.id);
                                    } else {
                                      set.delete(attr.id);
                                    }
                                    newMap.set(c.id, set);
                                    setSelectedAttributes(newMap);
                                  }}
                                  className="w-4 h-4"
                                />
                                <span className="text-dark-500">{attr.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Action Buttons */}
                  <div className="px-4 py-3 flex gap-2">
                    <button
                      onClick={() => handleRevoke(c.id)}
                      disabled={
                        blockchainLoading === c.id ||
                        c.expired ||
                        !c.active ||
                        (selectedAttributes.get(c.id)?.size || 0) === 0
                      }
                      className="flex-1 flex items-center justify-center gap-2 text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
                    >
                      {blockchainLoading === c.id ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Revoking...
                        </>
                      ) : (
                        <>
                          <RotateCcw size={14} /> Revoke
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="flex-1 flex items-center justify-center gap-2 text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingId === c.id ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} /> Delete
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <div className="text-center text-sm text-dark-300 mt-8">No items match the filter.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
