'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, ChevronRight, Shield, User, CreditCard, Fingerprint } from 'lucide-react';

// Sample onboarding steps data
const onboardingSteps = [
  {
    id: 1,
    title: 'Account Creation',
    description: 'Create your account with email and password',
    icon: <User size={20} className="text-green-600" />,
    completed: true,
    date: '2023-10-15'
  },
  {
    id: 2,
    title: 'Identity Verification',
    description: 'Verify your identity with government ID',
    icon: <CreditCard size={20} className="text-green-600" />,
    completed: true,
    date: '2023-10-16'
  },
  {
    id: 3,
    title: 'Security Setup',
    description: 'Set up two-factor authentication',
    icon: <Shield size={20} className="text-green-600" />,
    completed: true,
    date: '2023-10-17'
  },
  {
    id: 4,
    title: 'Biometric Registration',
    description: 'Register your biometric data for secure access',
    icon: <Fingerprint size={20} className="text-green-600" />,
    completed: true,
    date: '2023-10-18'
  }
];

export default function ReviewOnboardingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const steps = onboardingSteps;

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBack = () => {
    router.push('/UserProfile');
  };

  const handleStepClick = (id: number) => {
    // In a real app, this would navigate to the specific onboarding step
    console.log(`Navigate to onboarding step ${id}`);

    // For demonstration, we'll just show an alert
    alert(`This would take you to review step ${id}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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
        <h1 className="text-lg font-semibold text-black">Review Onboarding</h1>
      </div>

      {/* Onboarding Progress */}
      <div className="px-4 py-6">
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Onboarding Progress</h2>
            <div className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center">
              <CheckCircle size={14} className="mr-1" />
              Completed
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-green-600 h-2.5 rounded-full" style={{ width: '100%' }}></div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            You have completed all onboarding steps. Your account is fully set up.
          </p>
        </div>

        {/* Steps List */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider px-1">
            Completed Steps
          </h3>

          {steps.map((step) => (
            <button
              key={step.id}
              onClick={() => handleStepClick(step.id)}
              className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  {step.icon}
                </div>
                <div className="ml-3 text-left">
                  <p className="text-sm font-medium text-gray-900">{step.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                  <p className="text-xs text-green-600 mt-1">Completed on {formatDate(step.date)}</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
