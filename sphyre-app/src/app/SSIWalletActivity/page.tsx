'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle, } from 'lucide-react';
import dynamic from 'next/dynamic';

import ProfileBar from '@/components/ui/ProfileBar';
import ScanActionPopup from '@/components/ui/ScanActionPopup';
import ScanActionPortal from '@/components/ui/ScanActionPortal';

const BottomNav = dynamic(() => import('@/components/ui/BottomNav'), {
  ssr: false,
});

// Mock activity data
const mockActivities = [
  {
    id: 1,
    type: 'credential_issued',
    title: 'Lumera Employee Badge',
    description: 'Credential issued by Lumera Labs',
    timestamp: '2 hours ago',
    status: 'completed',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    id: 2,
    type: 'credential_shared',
    title: 'Identity Verification',
    description: 'Shared with licha.org IDV',
    timestamp: '1 day ago',
    status: 'completed',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    id: 3,
    type: 'credential_requested',
    title: 'Access Request',
    description: 'Pending approval from Neptune Visa',
    timestamp: '2 days ago',
    status: 'pending',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
];

export default function SSIWalletActivity() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showScanPopup, setShowScanPopup] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) {
    return (
        <div className="flex items-center justify-center h-screen bg-black">
          <p className="text-white">Loading...</p>
        </div>
    );
  }

  return (
      <>
        <div className="flex flex-col h-screen bg-black">
          {/* Header with Profile */}
          <div className="bg-black px-4 py-6">
            <ProfileBar username="blackdoffly" />
          </div>

          <div className="flex-grow bg-white rounded-t-3xl px-4 pt-8 pb-24 overflow-y-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Recent Activity</h2>
              <p className="text-gray-500 text-sm">Track your credential interactions and verifications</p>
            </div>

            {/* Activity List */}
            <div className="space-y-4">
              {mockActivities.length > 0 ? (
                  mockActivities.map((activity) => {
                    const IconComponent = activity.icon;
                    return (
                        <div
                            key={activity.id}
                            className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`w-10 h-10 rounded-lg ${activity.bgColor} flex items-center justify-center flex-shrink-0`}>
                              <IconComponent size={20} className={activity.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <h3 className="font-medium text-gray-900 truncate">{activity.title}</h3>
                                <span className="text-xs text-gray-500 ml-2">{activity.timestamp}</span>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{activity.description}</p>
                              <div className="flex items-center space-x-2">
                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    activity.status === 'completed'
                                        ? 'bg-green-100 text-green-800'
                                        : activity.status === 'pending'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-red-100 text-red-800'
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
                    <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                      <Clock size={24} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No recent activity</h3>
                    <p className="text-gray-500 text-sm">Your credential activities will appear here</p>
                  </div>
              )}
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

        {/* Scan Action Popup */}
        <ScanActionPortal>
          <ScanActionPopup
              visible={showScanPopup}
              onClose={() => setShowScanPopup(false)}
              onRequestCollect={handleRequestCollect}
              onShareInPerson={handleShareInPerson}
          />
        </ScanActionPortal>
      </>
  );
}