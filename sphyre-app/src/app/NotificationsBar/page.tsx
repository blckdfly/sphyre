'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, CheckCircle, AlertCircle, Info, Clock, Settings } from 'lucide-react';

// Define notification interface
interface Notification {
  id: number;
  type: 'success' | 'warning' | 'info' | 'pending';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

// Sample notifications data
const sampleNotifications: Notification[] = [
  {
    id: 1,
    type: 'success',
    title: 'Credential Shared',
    message: 'You successfully shared your identity credential with Lumera Labs.',
    time: '10 minutes ago',
    read: false
  },
  {
    id: 2,
    type: 'info',
    title: 'New Credential Offer',
    message: 'You have received a new credential offer from Government of Indonesia.',
    time: '1 hour ago',
    read: false
  },
  {
    id: 3,
    type: 'pending',
    title: 'Authentication Request',
    message: 'Jakarta University is requesting authentication. Tap to respond.',
    time: '3 hours ago',
    read: true
  },
  {
    id: 4,
    type: 'warning',
    title: 'Connection Request',
    message: 'NeptuneVisa is requesting to establish a connection with you.',
    time: '1 day ago',
    read: true
  },
  {
    id: 5,
    type: 'success',
    title: 'Verification Complete',
    message: 'Your identity verification has been successfully completed.',
    time: '2 days ago',
    read: true
  }
];

export default function NotificationsBarPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(sampleNotifications);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setMounted(true);

    // Calculate unread notifications count
    const count = notifications.filter(notification => !notification.read).length;
    setUnreadCount(count);
  }, [notifications]);

  const handleBack = () => {
    router.back(); // Go back to previous page instead of specific route
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

  const markAllAsRead = () => {
    setNotifications(prev => 
      prev.map(notification => ({ ...notification, read: true }))
    );
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    markAsRead(notification.id);

    // In a real app, you would navigate to the appropriate page based on the notification type
    // For now, just show an alert
    alert(`You clicked on notification: ${notification.title}`);
  };

  const getNotificationIcon = (type: Notification['type']) => {
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

  const handleSettingsClick = () => {
    // Navigate to the notifications settings page in UserProfile
    router.push('/Notifications');
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="bg-black px-4 py-4 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center">
          <button onClick={handleBack} className="mr-3 text-white">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-white">Activity Feed</h1>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={markAllAsRead}
            className="text-white hover:bg-gray-800 p-2 rounded-lg transition-colors"
            disabled={unreadCount === 0}
          >
            <CheckCircle size={20} className={unreadCount === 0 ? "opacity-50" : ""} />
          </button>
          <button 
            onClick={handleSettingsClick}
            className="text-white hover:bg-gray-800 p-2 rounded-lg transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Unread Count */}
      {unreadCount > 0 && (
        <div className="bg-blue-900 px-4 py-2 text-blue-100 text-sm">
          {unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
        </div>
      )}

      {/* Notifications List */}
      <div className="px-4 py-6">
        {notifications.length > 0 ? (
          <div className="space-y-4">
            {notifications.map((notification) => (
              <div 
                key={notification.id}
                className={`bg-gray-900 rounded-xl p-4 shadow-md border ${notification.read ? 'border-gray-800' : 'border-blue-500'}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="ml-3 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium ${notification.read ? 'text-white' : 'text-blue-400'}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-400">{notification.time}</p>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">{notification.message}</p>
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
            <Bell size={48} className="text-gray-600 mb-4" />
            <p className="text-gray-300 text-center">No notifications yet</p>
            <p className="text-gray-500 text-sm text-center mt-1">
              We&apos;ll notify you when something important happens
            </p>
          </div>
        )}
      </div>

      {/* Link to Notification Settings */}
      <div className="px-4 py-4 border-t border-gray-800">
        <button 
          onClick={handleSettingsClick}
          className="w-full flex items-center justify-center py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition-colors"
        >
          <Settings size={16} className="mr-2" />
          Notification Settings
        </button>
      </div>
    </div>
  );
}
