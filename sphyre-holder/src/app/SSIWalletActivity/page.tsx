'use client';

import React, { useState, useEffect, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle, XCircle, Send, Package, Eye, AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

import ProfileBar from '@/components/ui/ProfileBar';
import ScanActionPopup from '@/components/ui/ScanActionPopup';
import { useProfile } from '@/hooks/useProfile';
import ScanActionPortal from '@/components/ui/ScanActionPortal';
import activityService, { Activity, ActivityLoadResult, ActivityType } from '@/services/activityService';
import walletService from '@/services/walletService';
import { getBasescanUrl } from '@/services/consentService';
import apiService from '@/services/apiService';
import { useToast } from '@/contexts/ToastContext';

const BottomNav = dynamic(() => import('@/components/ui/BottomNav'), {
  ssr: false,
});

const getActivityStyle = (type: ActivityType, status: string) => {
  switch (type) {
    case 'credential_requested':
      return {
        icon: Send,
        color: status === 'pending' ? 'text-yellow-600' : 'text-blue-600',
        bgColor: status === 'pending' ? 'bg-yellow-50' : 'bg-blue-50',
      };
    case 'offer_received':
      return {
        icon: Package,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
      };
    case 'credential_issued':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
      };
    case 'credential_presented':
      return {
        icon: Eye,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
      };
    case 'offer_rejected':
      return {
        icon: XCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
      };
    case 'verification_completed':
      return {
        icon: CheckCircle,
        color: 'text-teal-600',
        bgColor: 'bg-teal-50',
      };
    default:
      return {
        icon: AlertCircle,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
      };
  }
};

export default function SSIWalletActivity() {
  const router = useRouter();
  const { profile } = useProfile();
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [showScanPopup, setShowScanPopup] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isLaunchingRequest, setIsLaunchingRequest] = useState(false);

  const metadataLabelMap: Record<string, string> = {
    tx_hash: 'Transaction',
    verifier_name: 'Verifier',
    credential_type: 'Credential Type',
    credential_id: 'Credential ID',
    status: 'Status',
    summary: 'Summary',
  };

  useEffect(() => {
    setMounted(true);
    const did = walletService.getCurrentDID();
    if (!did) {
      console.warn('No wallet DID available; skipping activity sync');
      setActivities([]);
      return;
    }

    const controller = new AbortController();

    const fetchActivities = async (force = false) => {
      if (controller.signal.aborted) {
        return;
      }

      setIsLoading((prev) => prev || force);
      setSyncError(null);

      const cached = activityService.getCachedActivities(did);
      if (cached.length > 0 && !force) {
        setActivities(cached.map((activity) => activityService.getActivityWithFormattedTime(activity)));
      }

      try {
        const result: ActivityLoadResult = await activityService.loadActivities(did, { force });
        if (controller.signal.aborted) {
          return;
        }

        setActivities(
          result.activities.map((activity) =>
            activityService.getActivityWithFormattedTime(activity)
          )
        );

        if (result.error) {
          setSyncError(result.error);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to sync activities';
        setSyncError(message);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchActivities(true);

    const interval = setInterval(() => {
      setActivities((prev) =>
        prev.map((activity) => activityService.getActivityWithFormattedTime(activity))
      );
    }, 60000);

    const syncTimer = setInterval(() => {
      fetchActivities(true);
    }, 1000 * 5);

    return () => {
      controller.abort();
      clearInterval(interval);
      clearInterval(syncTimer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pendingRedirect = sessionStorage.getItem('pending_presentation_redirect');
    if (!pendingRedirect) {
      return;
    }

    if (walletService.isSessionAuthenticated()) {
      sessionStorage.removeItem('pending_presentation_redirect');
      router.push(pendingRedirect);
    } else {
      walletService.requireSessionAuth(pendingRedirect, router);
    }
  }, [router, mounted]);

  const handleIdentityClick = () => {
    router.push('/SSIWalletIdentity');
  };

  const handleActivityClick = () => {
    console.log('Activity clicked');
  };

  const handleRequestCollect = () => {
    setShowScanPopup(false);
    console.log('Respond or Collect clicked');
  };

  const handleShareInPerson = () => {
    setShowScanPopup(false);
    router.push('/ShareCredentials');
  };

  const handleRespondToAccessRequest = async () => {
    if (!selectedActivity) {
      return;
    }

    const requestId = selectedActivity.metadata?.request_id || selectedActivity.metadata?.requestId;
    if (!requestId) {
      addToast('Missing request reference. Please try again from verifier.', 'error');
      return;
    }

    const holderDid = walletService.getCurrentDID();
    if (!holderDid) {
      addToast('Please set up your wallet first.', 'error');
      router.push('/onboarding');
      return;
    }

    setIsLaunchingRequest(true);
    try {
      const response = await apiService.getPendingPresentationRequests(holderDid);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Unable to load pending requests');
      }

      const payload = response.data as { success?: boolean; requests?: Record<string, unknown>[] };
      const requests = Array.isArray(payload.requests) ? payload.requests : [];

      const match = requests.find((req) => {
        if (!req) return false;
        const reqId = (req as Record<string, unknown>).request_id || (req as Record<string, unknown>).requestId;
        return typeof reqId === 'string' && reqId === requestId;
      }) as Record<string, unknown> | undefined;

      if (!match) {
        addToast('No pending request found. Please ask the verifier to resend.', 'warning');
        return;
      }

      sessionStorage.setItem('presentation_request', JSON.stringify(match));
      sessionStorage.setItem('presentation_request_id', requestId);
      sessionStorage.setItem('pending_presentation_redirect', '/CredentialRequest');
      setShowDetailModal(false);
      router.push('/CredentialRequest');
    } catch (error) {
      console.error('Failed to launch presentation request:', error);
    } finally {
      setIsLaunchingRequest(false);
    }
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  return (
    <Fragment>
      <div className="flex flex-col h-screen bg-black">
        {/* Header with Profile */}
        <div className="bg-black px-4 py-4">
          <ProfileBar username={profile?.username} />
        </div>

        <div className="flex-grow bg-white rounded-t-3xl overflow-hidden flex flex-col pb-24">
          {/* Fixed Header - doesn't scroll */}
          <div className="px-4 pt-8 pb-4 bg-white">
            <h2 className="text-2xl font-bold text-dark-500 mb-2">Recent Activity</h2>
            <div className="flex items-center justify-between">
              <p className="text-dark-300 text-sm">Track your credential interactions and verifications</p>
            </div>
            {syncError && <p className="text-xs text-red-500 mt-2">{syncError}</p>}
          </div>

          {/* Scrollable Activity List */}
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            <div className="space-y-4">
              {isLoading && activities.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-light-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Clock size={24} className="text-dark-200 animate-spin" />
                  </div>
                  <h3 className="text-lg font-medium text-dark-500 mb-2">Syncing activities…</h3>
                  <p className="text-dark-300 text-sm">
                    Fetching the latest wallet activity from the server.
                  </p>
                </div>
              ) : activities.length > 0 ? (
                activities.map((activity) => {
                  const style = getActivityStyle(activity.type, activity.status);
                  const IconComponent = style.icon;
                  return (
                    <div
                      key={activity.id}
                      onClick={() => {
                        setSelectedActivity(activity);
                        setShowDetailModal(true);
                      }}
                      className="bg-white border border-dark-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`w-10 h-10 rounded-lg ${style.bgColor} flex items-center justify-center flex-shrink-0`}>
                          <IconComponent size={20} className={style.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="font-medium text-dark-500 truncate">{activity.title}</h3>
                            <span className="text-xs text-dark-300 ml-2">{activityService.formatTimestamp(activity.timestamp)}</span>
                          </div>
                          <p className="text-sm text-dark-300 mb-2">{activity.description}</p>
                          <div className="flex items-center space-x-2">
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${activity.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : activity.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : activity.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                              {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-light-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Clock size={24} className="text-dark-200" />
                  </div>
                  <h3 className="text-lg font-medium text-dark-500 mb-2">No recent activity</h3>
                  <p className="text-dark-300 text-sm">
                    {syncError
                      ? 'Unable to reach the server right now. Showing any cached activities we could find.'
                      : 'Your credential activities will appear here once you interact with issuers and verifiers.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 z-10">
          <BottomNav
            onAddClick={handleIdentityClick}
            onScanToggle={() => setShowScanPopup(true)}
            onActivityClick={handleActivityClick}
            activeTab="activity"
          />
        </div>
      </div>

      <ScanActionPortal>
        <ScanActionPopup
          visible={showScanPopup}
          onClose={() => setShowScanPopup(false)}
          onRequestCollect={handleRequestCollect}
          onShareInPerson={handleShareInPerson}
        />
      </ScanActionPortal>

      {showDetailModal && selectedActivity && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-dark-500">Activity Detail</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-dark-300 hover:text-dark-500"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-dark-300 mb-1">Type</p>
                <p className="font-medium text-dark-500">{selectedActivity.title}</p>
              </div>
              <div>
                <p className="text-sm text-dark-300 mb-1">Description</p>
                <p className="text-dark-500">{selectedActivity.description}</p>
              </div>
              <div>
                <p className="text-sm text-dark-300 mb-1">Time</p>
                <p className="text-dark-500">{activityService.formatTimestamp(selectedActivity.timestamp)}</p>
                <p className="text-xs text-dark-300 mt-1">
                  {new Date(selectedActivity.timestamp).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-dark-300 mb-1">Status</p>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${selectedActivity.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : selectedActivity.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : selectedActivity.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                >
                  {selectedActivity.status.charAt(0).toUpperCase() + selectedActivity.status.slice(1)}
                </span>
              </div>

              {selectedActivity.metadata && Object.keys(selectedActivity.metadata).length > 0 && (
                <div>
                  <p className="text-sm text-dark-300 mb-2">Additional Information</p>
                  <div className="bg-light-75 rounded-lg p-3 space-y-2">
                    {Object.entries(selectedActivity.metadata).map(([key, value]) => {
                      const normalizedKey = key.trim().toLowerCase();
                      const label = metadataLabelMap[normalizedKey] || key.replace(/_/g, ' ');
                      const isTxHash = normalizedKey === 'tx_hash' && typeof value === 'string' && value.length > 0;
                      const shortHash =
                        isTxHash && typeof value === 'string'
                          ? `${value.slice(0, 6)}…${value.slice(-4)}`
                          : '';

                      return (
                        <div key={key} className="flex justify-between items-start">
                          <span className="text-sm text-dark-400 capitalize">{label}:</span>
                          {isTxHash ? (
                            <a
                              href={getBasescanUrl(value as string)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-black font-medium ml-2 text-right"
                              title={`View transaction ${value}`}
                            >
                              Tx{shortHash && `(${shortHash})`}
                            </a>
                          ) : (
                            <span className="text-sm text-dark-500 ml-2 text-right break-all">
                              {String(value)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedActivity.type === 'access_requested' && selectedActivity.status === 'pending' && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleRespondToAccessRequest}
                    disabled={isLaunchingRequest}
                    className={`w-full inline-flex items-center justify-center px-4 py-3 rounded-xl text-sm font-semibold text-white transition ${isLaunchingRequest ? 'bg-dark-200 cursor-not-allowed' : 'bg-primary-500 hover:bg-primary-600'
                      }`}
                  >
                    {isLaunchingRequest ? 'Opening request…' : 'Respond now'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Fragment>
  );
}