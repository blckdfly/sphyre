'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function PrivacyPolicyPage() {
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
        <h1 className="text-lg font-semibold text-dark-500">Privacy Policy</h1>
      </div>

      <main className="px-4 py-8 md:px-8 lg:px-10 max-w-3xl mx-auto space-y-10">
        <section className="space-y-4">
          <p className="text-sm font-medium text-primary-500 uppercase tracking-wide">Our promise to you</p>
          <h2 className="text-2xl font-semibold">Your identity stays under your control</h2>
          <p className="text-sm leading-6 text-dark-400">
            Sphyre is built as a self-sovereign identity wallet. We minimise the data we see, encrypt everything we
            must process, and give you clear choices every time information leaves your device.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">What we process</h3>
          <ul className="space-y-2 text-sm leading-6 text-dark-400 list-disc pl-5">
            <li><span className="font-medium">Wallet essentials</span> such as a pseudonymous identifier and device fingerprints so you can unlock securely.</li>
            <li><span className="font-medium">Credential metadata</span> that helps you organise issuers, not the underlying attestations themselves.</li>
            <li><span className="font-medium">Usage insights</span> generated locally to improve your experience; analytics shared with us are anonymised.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">How your data is protected</h3>
          <p className="text-sm leading-6 text-dark-400">
            Keys never leave your device. Sensitive payloads are encrypted end-to-end before travelling to issuers or
            verifiers. We use hardware-backed secure storage where available and rotate secrets regularly.
          </p>
          <p className="text-sm leading-6 text-dark-400">
            When you approve a data share, we log the consent locally so you can trace exactly what was shared, when,
            and with whom.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Your controls</h3>
          <ul className="space-y-2 text-sm leading-6 text-dark-400 list-disc pl-5">
            <li>Access a full activity trail from Wallet Activity at any time.</li>
            <li>Rotate or revoke credentials instantly if you suspect misuse.</li>
            <li>Export or delete locally stored data from the Security & Recovery area.</li>
            <li>Contact our privacy team to request assistance or clarification.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Talk to us</h3>
          <p className="text-sm leading-6 text-dark-400">
            Questions about how we protect your information? Email
            {' '}<a href="mailto:privacy@sphyre.tech" className="text-primary-500 hover:underline">privacy@sphyre.tech</a>.
            We respond within two business days.
          </p>
        </section>
      </main>
    </div>
  );
}