'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, RotateCcw, ShieldCheck } from 'lucide-react';
import { ConsentRecord, deleteConsent, listConsents, revokeConsent, purgeExpiredConsents, revokeAllActive } from '@/lib/consent';

export default function ConsentManagementPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  useEffect(() => {
    setMounted(true);
    refresh();
  }, []);

  const refresh = () => {
    setConsents(listConsents());
  };

  const handleBack = () => {
    router.push('/UserProfile');
  };

  const handleRevoke = (id: string) => {
    if (confirm('Revoke this consent?')) {
      revokeConsent(id);
      refresh();
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Permanently delete this consent record?')) {
      deleteConsent(id);
      refresh();
    }
  };

  const formatted = useMemo(() => {
    const now = Date.now();
    return consents.map(c => ({
      ...c,
      created: new Date(c.createdAt).toLocaleString(),
      expiry: c.expiresAt ? new Date(c.expiresAt).toLocaleString() : 'None',
      expired: !!(c.expiresAt && c.expiresAt < now),
    }));
  }, [consents]);

  const visible = useMemo(() => {
    if (!showActiveOnly) return formatted;
    return formatted.filter((c) => c.active && !c.expired);
  }, [formatted, showActiveOnly]);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <p className="text-black">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center border-b border-gray-200">
        <button onClick={handleBack} className="mr-3">
          <ArrowLeft size={24} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-medium text-gray-900">Consent Management</h1>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-6">
        {formatted.length === 0 ? (
          <div className="text-center text-gray-600 mt-16">
            <ShieldCheck className="mx-auto mb-4 text-gray-400" />
            <p>No saved consents yet.</p>
            <p className="text-sm text-gray-500 mt-1">Consents you save will appear here.</p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex items-center justify-between mb-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" className="w-4 h-4" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)} />
                Show active only
              </label>
              <div className="flex items-center gap-2">
                <button onClick={() => {
                  const removed = purgeExpiredConsents();
                  if (removed > 0) alert(`${removed} expired consent(s) removed.`);
                  refresh();
                }} className="text-xs px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Clear expired</button>
                <button onClick={() => {
                  if (confirm('Revoke all active consents?')) {
                    const n = revokeAllActive();
                    if (n > 0) alert(`${n} consent(s) revoked.`);
                    refresh();
                  }
                }} className="text-xs px-3 py-2 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700">Revoke all active</button>
              </div>
            </div>

            <div className="space-y-4">
              {visible.map((c) => (
                <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{c.requesterName}</p>
                      <p className="text-sm text-gray-500">{c.requesterId}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${c.expired ? 'bg-red-100 text-red-700' : c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {c.expired ? 'Expired' : c.active ? 'Active' : 'Revoked'}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-gray-700">
                    <p><span className="text-gray-500">Purpose:</span> {c.purpose}</p>
                    <p className="mt-1"><span className="text-gray-500">Created:</span> {c.created}</p>
                    <p><span className="text-gray-500">Expires:</span> {c.expiry}</p>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">Data scope:</p>
                    <div className="flex flex-wrap gap-2">
                      {c.scope.map(s => (
                        <span key={s.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{s.label}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button onClick={() => handleRevoke(c.id)} className="flex items-center gap-2 text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-2 rounded-lg text-sm">
                      <RotateCcw size={16} /> Revoke
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="flex items-center gap-2 text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg text-sm">
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <div className="text-center text-sm text-gray-500 mt-8">No items match the filter.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
