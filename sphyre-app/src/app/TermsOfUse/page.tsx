'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

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
        <h1 className="text-lg font-semibold text-black">Terms of Use</h1>
      </div>

      {/* Terms of Use Content */}
      <div className="px-4 py-6">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="prose max-w-none text-gray-800">
            <h2 className="text-xl font-semibold mb-4">Terms of Use</h2>
            <p className="text-sm mb-4">Last updated: November 1, 2023</p>
            
            <h3 className="text-lg font-medium mt-6 mb-3">1. Acceptance of Terms</h3>
            <p className="text-sm mb-4">
              By accessing or using the Sphyre application, you agree to be bound by these Terms of Use. 
              If you do not agree to all the terms and conditions, you must not use the application.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">2. Changes to Terms</h3>
            <p className="text-sm mb-4">
              We may revise these terms at any time by updating this page. By using this application after 
              such changes are made, you agree to the revised terms. It is your responsibility to check this 
              page periodically for changes.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">3. Account Registration</h3>
            <p className="text-sm mb-4">
              To use certain features of the application, you may be required to register for an account. 
              You agree to provide accurate, current, and complete information during the registration process 
              and to update such information to keep it accurate, current, and complete.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">4. User Conduct</h3>
            <p className="text-sm mb-2">
              You agree not to use the application to:
            </p>
            <ul className="list-disc pl-5 text-sm mb-4">
              <li className="mb-1">Violate any applicable laws or regulations</li>
              <li className="mb-1">Infringe the rights of any third party</li>
              <li className="mb-1">Transmit any material that is unlawful, harmful, threatening, or otherwise objectionable</li>
              <li className="mb-1">Impersonate any person or entity</li>
              <li className="mb-1">Interfere with or disrupt the application or servers</li>
              <li className="mb-1">Attempt to gain unauthorized access to any part of the application</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">5. Intellectual Property</h3>
            <p className="text-sm mb-4">
              The application and its original content, features, and functionality are owned by Sphyre and 
              are protected by international copyright, trademark, patent, trade secret, and other intellectual 
              property or proprietary rights laws.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">6. Termination</h3>
            <p className="text-sm mb-4">
              We may terminate or suspend your account and access to the application immediately, without prior 
              notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">7. Limitation of Liability</h3>
            <p className="text-sm mb-4">
              In no event shall Sphyre, nor its directors, employees, partners, agents, suppliers, or affiliates, 
              be liable for any indirect, incidental, special, consequential or punitive damages, including without 
              limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your 
              access to or use of or inability to access or use the application.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">8. Governing Law</h3>
            <p className="text-sm mb-4">
              These Terms shall be governed and construed in accordance with the laws, without regard to its 
              conflict of law provisions.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">9. Contact Us</h3>
            <p className="text-sm mb-4">
              If you have any questions about these Terms, please contact us at:
              <br />
              <a href="mailto:terms@sphyre.com" className="text-blue-600 hover:underline">terms@sphyre.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}