'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function TermsOfUsePage() {
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
        <h1 className="text-lg font-semibold text-dark-500">Terms of Use</h1>
      </div>

      <main className="px-4 py-8 md:px-8 lg:px-10 max-w-3xl mx-auto space-y-10">
        <section className="space-y-4">
          <p className="text-sm font-medium text-primary-500 uppercase tracking-wide">Please read carefully</p>
          <h2 className="text-2xl font-semibold">Using Sphyre means you agree to these terms</h2>
          <p className="text-sm leading-6 text-dark-400">
            The Sphyre wallet keeps you in charge of your data. These terms explain how you can use the app, what we
            expect from you, and how we safeguard the services we provide.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Account & access</h3>
          <p className="text-sm leading-6 text-dark-400">
            You are responsible for keeping your device secure, storing your recovery materials, and ensuring any
            information you input is accurate. If you share a device, make sure you log out when you are done.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">What you must not do</h3>
          <ul className="space-y-2 text-sm leading-6 text-dark-400 list-disc pl-5">
            <li>Use the wallet for fraudulent or unlawful activity.</li>
            <li>Attempt to break, reverse engineer, or bypass security features.</li>
            <li>Share or publish credentials that belong to someone else without their consent.</li>
            <li>Upload malware or interfere with our infrastructure.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Intellectual property</h3>
          <p className="text-sm leading-6 text-dark-400">
            The Sphyre name, logo, and software are owned by us. Using the app does not give you ownership of our
            intellectual property. You may not use our branding without permission.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Ending your use</h3>
          <p className="text-sm leading-6 text-dark-400">
            You can uninstall the app and wipe your wallet at any time. We may suspend or terminate access if we detect
            abuse or security risks. When that happens, we will notify you whenever legally possible.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Liability</h3>
          <p className="text-sm leading-6 text-dark-400">
            We provide Sphyre “as is”. To the maximum extent allowed by law we are not liable for indirect or
            consequential losses. Always keep your recovery materials safe—losing them may mean we cannot help you
            regain access.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Talk to us</h3>
          <p className="text-sm leading-6 text-dark-400">
            Questions about these terms? Email{' '}
            <a href="mailto:terms@sphyre.tech" className="text-primary-500 hover:underline">terms@sphyre.tech</a>.
            We will respond within two business days.
          </p>
        </section>
      </main>
    </div>
  );
}