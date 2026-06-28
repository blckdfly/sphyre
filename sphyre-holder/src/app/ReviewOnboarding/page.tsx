'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Shield, User, CreditCard, Fingerprint } from 'lucide-react';

const onboardingMilestones = [
  {
    id: 1,
    title: 'Wallet Created',
    description:
      'You generated your self-sovereign wallet and the encryption keys are stored only on this device.',
    icon: <User size={20} className="text-primary-500" />,
    date: '2025-02-01'
  },
  {
    id: 2,
    title: 'Identity Profile Verified',
    description:
      'Your core identity attributes were confirmed and anchored locally so you can sign future requests with confidence.',
    icon: <CreditCard size={20} className="text-primary-500" />,
    date: '2025-02-02'
  },
  {
    id: 3,
    title: 'Secure Recovery Enabled',
    description:
      'A recovery kit and seed phrase were created. Only you control this information and it never leaves your custody.',
    icon: <Shield size={20} className="text-primary-500" />,
    date: '2025-02-03'
  },
  {
    id: 4,
    title: 'Trusted Sharing Ready',
    description:
      'Consent preferences were configured so you can decide what verifiers see each time you share credentials.',
    icon: <Fingerprint size={20} className="text-primary-500" />,
    date: '2025-02-04'
  }
];

export default function ReviewOnboardingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBack = () => {
    router.push('/UserProfile');
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-light-50">
        <p className="text-dark-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-dark-500">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center">
        <button onClick={handleBack} className="mr-3">
          <ChevronLeft size={24} className="text-dark-500" />
        </button>
        <h1 className="text-lg font-semibold text-dark-500">Review Onboarding</h1>
      </div>

      <main className="px-4 py-8 md:px-8 lg:px-10 max-w-3xl mx-auto space-y-12">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">You are ready to use your Sphyre Wallet</h2>
          <p className="text-sm leading-6 text-dark-400">
            Every onboarding milestone was designed to keep you in control of your identity data. Below is a
            concise record of what we configured together and the benefits you now have when issuing or sharing
            credentials.
          </p>
        </section>

        <section className="space-y-6">
          <h3 className="text-lg font-semibold">Milestones you completed</h3>
          <ul className="space-y-6">
            {onboardingMilestones.map((step) => (
              <li key={step.id} className="flex items-start gap-3">
                <span className="mt-1">{step.icon}</span>
                <div className="space-y-2">
                  <p className="text-base font-medium">{step.title}</p>
                  <p className="text-sm text-dark-400 leading-6">{step.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">What you can do next</h3>
          <ul className="space-y-3 text-sm text-dark-400 leading-6">
            <li>
              • Review the <span className="font-medium">Wallet Activity</span> screen to monitor any credential
              issuance or verification from trusted partners.
            </li>
            <li>
              • Visit <span className="font-medium">Credential Vault</span> to organize credentials into collections
              before sharing them with new verifiers.
            </li>
            <li>
              • Explore <span className="font-medium">Security & Recovery</span> to refresh your seed phrase backup or
              add a secondary recovery contact.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Need to revisit something?</h3>
          <p className="text-sm text-dark-400 leading-6">
            Each onboarding step can be replayed at any time. If you wish to update your profile, rotate keys, or edit
            consent defaults, head to the settings area of the wallet. Everything remains local-first, so no data moves
            anywhere without your explicit approval.
          </p>
        </section>
      </main>
    </div>
  );
}
