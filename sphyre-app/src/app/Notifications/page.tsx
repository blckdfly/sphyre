'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, CheckCircle, AlertCircle, Info, Clock } from 'lucide-react';

// Sample notifications data
const sampleNotifications = [
  {
    id: 1,
    type: 'success',
    title: 'Credential Accepted',
    message: 'Your identity credential has been successfully accepted.',
    time: '2 hours ago',
    read: false
  },
  {
    id: 2,
    type: 'warning',
    title: 'Verification Required',
    message: 'Please complete your identity verification process.',
    time: '1 day ago',
    read: true
  },
  {
    id: 3,
    type: 'info',
    title: 'New Feature Available',
    message: 'Check out our new credential sharing feature.',
    time: '3 days ago',
    read: true
  },
  {
    id: 4,
    type: 'pending',
    title: 'Credential Offer Pending',
    message: 'You have a pending credential offer from Lumera Labs.',
    time: '5 days ago',
    read: false
  }
];

export default function NotificationsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState(sampleNotifications);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBack = () => {
    router.push('/UserProfile');
  };

  const markAsRead = (id: number) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id 
          ? { ...notification, read: true } 
          : notification
      )
    );
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle size={20} className="text-green-500" />;
      case 'warning':
        return <AlertCircle size={20} className="text-yellow-500" />;
      case 'info':
        return <Info size={20} className="text-blue-500" />;
      case 'pending':
        return <Clock size={20} className="text-purple-500" />;
      default:
        return <Bell size={20} className="text-gray-500" />;
    }
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <p className="text-black">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center border-b border-gray-200">
        <button onClick={handleBack} className="mr-3">
          <ArrowLeft size={24} className="text-black" />
        </button>
        <h1 className="text-lg font-semibold text-black">Notifications</h1>
      </div>

      {/* Notifications List */}
      <div className="px-4 py-6">
        {notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div 
                key={notification.id}
                className={`bg-white rounded-xl p-4 shadow-sm border ${notification.read ? 'border-gray-200' : 'border-blue-300'}`}
                onClick={() => markAsRead(notification.id)}
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="ml-3 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium ${notification.read ? 'text-gray-900' : 'text-blue-600'}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-500">{notification.time}</p>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                  </div>
                </div>
                {!notification.read && (
                  <div className="mt-2 flex justify-end">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <Bell size={48} className="text-gray-300 mb-4" />
            <p className="text-gray-500 text-center">No notifications yet</p>
            <p className="text-gray-400 text-sm text-center mt-1">
              We&apos;ll notify you when something important happens
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
