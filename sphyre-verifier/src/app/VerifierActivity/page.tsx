'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle, XCircle, Shield, AlertCircle, ChevronDown, RefreshCw, ExternalLink, Hourglass, RotateCcw, TriangleAlert } from 'lucide-react';
import Header from '@/components/ui/Header';

// Activity types for verifier
type ActivityType =
  | 'verification_completed'
  | 'verification_failed'
  | 'presentation_received';

type ActivityStatus = 'success' | 'failed';

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: Date;
  status: ActivityStatus;
  holderLabel?: string;
  credentialType?: string;
  requiredAttributes?: string[];
  providedAttributes?: string[];
  revokedAttributes?: string[];
  credentialStatus?: 'active' | 'revoked' | 'expired';
  consentStatus?: 'active' | 'revoked' | 'expired';
  consentExpiresAt?: string | null;
  ipfsHash?: string;
  ipfsGatewayUrl?: string;
  blockchainTx?: string;
  blockchainReference?: string;
  presentationId?: string;
  verifierDid?: string;
}

// Get icon and colors for activity type
const getActivityStyle = (type: ActivityType) => {
  switch (type) {
    case 'verification_completed':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        darkBgColor: 'bg-green-900/20',
        darkColor: 'text-green-400',
      };
    case 'verification_failed':
      return {
        icon: XCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        darkBgColor: 'bg-red-900/20',
        darkColor: 'text-red-400',
      };
    case 'presentation_received':
      return {
        icon: Shield,
        color: 'text-teal-600',
        bgColor: 'bg-teal-50',
        darkBgColor: 'bg-teal-900/20',
        darkColor: 'text-teal-400',
      };
    default:
      return {
        icon: AlertCircle,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        darkBgColor: 'bg-gray-800',
        darkColor: 'text-gray-400',
      };
  }
};

const getStatusChip = (
  credentialStatus?: 'active' | 'revoked' | 'expired',
  consentStatus?: 'active' | 'revoked' | 'expired',
  verificationStatus?: 'success' | 'failed',
) => {
  const normalizedCredential = credentialStatus || 'active';
  const normalizedConsent = consentStatus || 'active';

  // If verification failed, show that first
  if (verificationStatus === 'failed') {
    return {
      label: 'Verification Failed',
      className: 'text-red-300 bg-[#341212] border border-red-700/40',
      Icon: XCircle,
    };
  }

  if (normalizedCredential === 'revoked' && normalizedConsent !== 'revoked') {
    return {
      label: 'Credential Revoked',
      className: 'text-red-300 bg-[#341212] border border-red-700/40',
      Icon: TriangleAlert,
    };
  }

  if (normalizedConsent === 'revoked') {
    return {
      label: 'Consent Revoked',
      className: 'text-red-300 bg-[#341212] border border-red-700/40',
      Icon: TriangleAlert,
    };
  }

  if (normalizedConsent === 'expired' || normalizedCredential === 'expired') {
    return {
      label: 'Consent Expired',
      className: 'text-amber-200 bg-[#342512] border border-amber-700/40',
      Icon: Hourglass,
    };
  }

  return {
    label: 'Active',
    className: 'text-green-200 bg-[#173321] border border-green-700/40',
    Icon: undefined,
  };
};

const getTimeAgo = (timestamp: Date): string => {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - timestamp.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

interface ActivityDetail extends Activity {
  requiredAttributes?: string[];
  attributesProvided?: string[];
  verificationDetails?: string;
}

interface Presentation {
  id: string;
  prover_did: string | null;
  prover_pseudonym?: string | null;
  verifier_did: string;
  presentation_type: string;
  credential_ids: string[];
  presentation_data: Record<string, unknown>;
  jwt: string;
  status: 'pending' | 'verified' | 'rejected' | 'failed';
  created_at: string;
  verified_at?: string;
  is_verified: boolean;
}

export default function VerifierActivity() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    loadActivities();

    // Update timestamps every minute
    const interval = setInterval(() => {
      setActivities(prev => [...prev]);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    return {
      verified: activities.filter(a => a.status === 'success').length,
      failed: activities.filter(a => a.status === 'failed').length,
    };
  }, [activities]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      const verifierDID = localStorage.getItem('verifierDID');
      if (!verifierDID) {
        console.warn('Verifier DID not found');
        setActivities([]);
        return;
      }

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';
      const encodedDID = encodeURIComponent(verifierDID);
      const response = await fetch(`${API_URL}/api/verifier/${encodedDID}/presentations`);

      if (!response.ok) {
        throw new Error(`Failed to fetch presentations: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.presentations && Array.isArray(data.presentations)) {
        const activities: Activity[] = (data.presentations as Presentation[])
          .filter((pres) => pres.status !== 'pending')
          .map((pres) => {
            const activityStatus: ActivityStatus = pres.status === 'verified' ? 'success' : 'failed';
            const type: ActivityType = pres.status === 'verified' ? 'verification_completed' : 'verification_failed';
            const presentationData = (pres.presentation_data as Record<string, unknown>) || {};
            const expiresAtIso = typeof presentationData.consent_expires_at === 'string'
              ? (presentationData.consent_expires_at as string)
              : null;

            const holderLabel =
              (presentationData.holder_pseudonym as string | undefined) ||
              (presentationData.holder_label as string | undefined) ||
              (pres.prover_did as string | undefined) ||
              undefined;

            const friendlyLabel = holderLabel
              ? holderLabel.length > 24
                ? `${holderLabel.slice(0, 24)}…`
                : holderLabel
              : 'Anonymous holder';

            return {
              id: pres.id,
              type,
              title: pres.status === 'verified' ? 'Verification Successful' : 'Verification Failed',
              description: `${pres.presentation_type || 'Presentation'} from ${friendlyLabel}`,
              timestamp: new Date(pres.created_at),
              status: activityStatus,
              holderLabel,
              credentialType: pres.presentation_type,
              requiredAttributes: presentationData?.required_attributes as string[] || [],
              providedAttributes: presentationData?.provided_attributes as string[] || [],
              revokedAttributes: presentationData?.revoked_attributes as string[] || [],
              credentialStatus: ((presentationData?.credential_status as string) || 'active') as 'active' | 'revoked' | 'expired',
              consentStatus: ((presentationData?.consent_status as string) || 'active') as 'active' | 'revoked' | 'expired',
              consentExpiresAt: expiresAtIso,
              ipfsHash: (presentationData?.ipfs_hash as string) || undefined,
              ipfsGatewayUrl: (presentationData?.ipfs_gateway_url as string) || undefined,
              blockchainTx: (presentationData?.blockchain_tx as string) || undefined,
              blockchainReference: (presentationData?.blockchain_reference as string) || undefined,
              presentationId: pres.id,
              verifierDid: pres.verifier_did,
            };
          });

        setActivities(activities);
        console.log('Loaded', activities.length, 'activities from backend');
      } else {
        setActivities([]);
      }
    } catch (error) {
      console.error('Failed to load activities from backend:', error);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAgain = async (activity: Activity) => {
    if (!activity.presentationId) {
      return;
    }

    const verifierDID = localStorage.getItem('verifierDID');
    if (!verifierDID) {
      setActionError('Verifier DID missing. Please re-authenticate.');
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

    setRetryingId(activity.id);
    setActionError(null);

    try {
      const response = await fetch(
        `${API_URL}/api/verifier/presentations/${activity.presentationId}/resend`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Verifier-DID': verifierDID,
          },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed (${response.status})`);
      }

      const payload = await response.json();
      const request = payload.request as {
        request_id: string;
        holder_pseudonym?: string;
        holder_did?: string;
      };

      if (!request?.request_id) {
        throw new Error('Resend succeeded but request_id is missing.');
      }

      sessionStorage.setItem('verifier_active_request_id', request.request_id);
      const holderLabel = request.holder_pseudonym || request.holder_did || null;
      if (holderLabel) {
        sessionStorage.setItem('verifier_active_holder_label', holderLabel);
      }

      const params = new URLSearchParams({ requestId: request.request_id });
      if (holderLabel) {
        params.set('holderPseudonym', holderLabel);
      }

      router.push(`/WaitingForHolder?${params.toString()}`);
    } catch (error) {
      console.error('Failed to resend presentation request:', error);
      setActionError(
        error instanceof Error ? error.message : 'Failed to request access again.',
      );
    } finally {
      setRetryingId(null);
    }
  };


  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Header />

      {/* Main Content */}
      <div className="flex-1 bg-light-50 rounded-t-3xl px-4 py-6">
        <div className="max-w-md mx-auto">
          {/* Title Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
              <button
                onClick={() => router.push('/VerifierHome')}
                className="text-gray-600 text-sm hover:text-gray-800"
              >
                Back
              </button>
            </div>
            <p className="text-gray-500 text-sm">Your verification history</p>
          </div>

          {/* Activity Stats - Real Data */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-dark-500 rounded-xl p-4 text-center text-white shadow-lg shadow-black/20">
              <div className="text-2xl font-bold text-[#FFFFFF]">{stats.verified}</div>
              <div className="text-xs text-gray-300 mt-1">Verified</div>
            </div>
            <div className="bg-dark-500 rounded-xl p-4 text-center text-white shadow-lg shadow-black/20">
              <div className="text-2xl font-bold text-[#FFFFFF]">{stats.failed}</div>
              <div className="text-xs text-gray-300 mt-1">Failed</div>
            </div>
          </div>

          {/* Refresh Button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => loadActivities()}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-200 hover:bg-gray-300 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {actionError && (
            <div className="mt-4 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded-lg px-3 py-2">
              {actionError}
            </div>
          )}

          {/* Activities List */}
          <div className="space-y-3">
            {activities.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 mb-2">No activity yet</p>
                <p className="text-gray-400 text-sm">Your verification history will appear here</p>
              </div>
            ) : (
              activities.map((activity) => {
                const style = getActivityStyle(activity.type);
                const IconComponent = style.icon;

                const isExpanded = expandedId === activity.id;
                const status = activity.credentialStatus;
                const consentStatus = activity.consentStatus;
                const { label: statusLabel, className: statusClass, Icon: StatusIcon } = getStatusChip(status, consentStatus, activity.status);

                const canRequestAgain = consentStatus === 'expired' || consentStatus === 'revoked';

                return (
                  <div
                    key={activity.id}
                    className="bg-dark-500 rounded-2xl overflow-hidden shadow-lg shadow-black/20"
                  >
                    {/* Card Header */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                      className="w-full p-4 transition-colors text-left"
                    >
                      <div className="flex items-start space-x-4">
                        {/* Icon */}
                        <div className={`rounded-xl p-3 flex-shrink-0 ${style.darkBgColor}`}>
                          <IconComponent className={`w-5 h-5 ${style.darkColor}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-1">
                            <h3 className="text-white font-semibold text-sm">
                              {activity.title}
                            </h3>
                            <span className="text-gray-400 text-xs flex-shrink-0 ml-2">
                              {getTimeAgo(activity.timestamp)}
                            </span>
                          </div>

                          <p className="text-gray-400 text-xs mb-2">
                            {activity.description}
                          </p>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(activity.credentialStatus || activity.consentStatus || activity.status) && (
                              <span className={`inline-flex items-center px-2 py-1 text-xs rounded-lg gap-1 ${statusClass}`}>
                                {StatusIcon && <StatusIcon className="w-3 h-3" />}
                                <span>{statusLabel}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expand Icon */}
                        <ChevronDown
                          size={20}
                          className={`text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="border-t border-[#1f2d54] p-4 space-y-3 bg-dark-500">
                        {/* Consents */}
                        {activity.consentExpiresAt && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Consent expired at</p>
                            <p className="text-xs text-amber-300">
                              {new Date(activity.consentExpiresAt).toLocaleString()}
                            </p>
                          </div>
                        )}

                        {canRequestAgain && activity.presentationId && (
                          <div className="pt-2">
                            <button
                              type="button"
                              disabled={retryingId === activity.id}
                              onClick={() => handleRequestAgain(activity)}
                              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition ${retryingId === activity.id
                                ? 'bg-slate-600/50 text-slate-300 cursor-not-allowed'
                                : 'bg-[#1a2c56] text-[#AAB2FF] hover:bg-[#24386a]'
                                }`}
                            >
                              <RotateCcw className={retryingId === activity.id ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
                              {retryingId === activity.id ? 'Requesting…' : 'Request consent again'}
                            </button>
                          </div>
                        )}

                        {/* Holder Label */}
                        {activity.holderLabel && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Holder</p>
                            <p className="text-xs font-mono text-[#AAB2FF] break-all">{activity.holderLabel}</p>
                          </div>
                        )}

                        {/* Valid Attributes */}
                        {activity.providedAttributes && activity.providedAttributes.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-400 mb-2">Valid Attributes</p>
                            <div className="flex flex-wrap gap-2">
                              {activity.providedAttributes.map((attr, idx) => (
                                <span key={idx} className="px-2 py-1 bg-[#16312b] text-[#7EE0AC] text-xs rounded border border-green-700/30">
                                  {attr}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Revoked Attributes */}
                        {activity.revokedAttributes && activity.revokedAttributes.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-400 mb-2">Revoked Attributes</p>
                            <div className="flex flex-wrap gap-2">
                              {activity.revokedAttributes.map((attr, idx) => (
                                <span key={idx} className="px-2 py-1 bg-[#331a1a] text-[#FF9E9E] text-xs rounded border border-red-700/30 line-through">
                                  {attr}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Credential Links */}
                        <div className="pt-2 border-t border-[#1f2d54] text-xs text-gray-300">
                          <div className="flex items-center justify-between">
                            <span>{activity.timestamp.toLocaleString()}</span>
                            {activity.ipfsHash && (
                              <button
                                onClick={() => {
                                  const searchParams = new URLSearchParams();
                                  if (activity.presentationId) {
                                    searchParams.set('presentationId', activity.presentationId);
                                  }
                                  if (activity.verifierDid) {
                                    searchParams.set('verifierDid', activity.verifierDid);
                                  }

                                  router.push(`/verify/${activity.ipfsHash}?${searchParams.toString()}`);
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 text-xs text-[#AAB2FF] bg-[#1a2c56] rounded-lg hover:bg-[#24386a] transition"
                              >
                                <ExternalLink size={14} />
                                View full verification details
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
