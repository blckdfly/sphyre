'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

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
        <h1 className="text-lg font-semibold text-black">Privacy Policy</h1>
      </div>

      {/* Privacy Policy Content */}
      <div className="px-4 py-6">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="prose max-w-none text-gray-800">
            <h2 className="text-xl font-semibold mb-4">Privacy Policy</h2>
            <p className="text-sm mb-4">Last updated: November 1, 2023</p>
            
            <h3 className="text-lg font-medium mt-6 mb-3">1. Introduction</h3>
            <p className="text-sm mb-4">
              Welcome to Sphyre. We respect your privacy and are committed to protecting your personal data. 
              This privacy policy will inform you about how we look after your personal data when you use our 
              application and tell you about your privacy rights and how the law protects you.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">2. Data We Collect</h3>
            <p className="text-sm mb-2">
              We collect and process the following categories of personal data:
            </p>
            <ul className="list-disc pl-5 text-sm mb-4">
              <li className="mb-1">Identity information (name, date of birth, gender, nationality)</li>
              <li className="mb-1">Contact information (email address, phone number)</li>
              <li className="mb-1">Technical data (device information, IP address, browser type)</li>
              <li className="mb-1">Usage data (how you use our application)</li>
              <li className="mb-1">Credential data (information contained in your digital credentials)</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">3. How We Use Your Data</h3>
            <p className="text-sm mb-2">
              We use your personal data for the following purposes:
            </p>
            <ul className="list-disc pl-5 text-sm mb-4">
              <li className="mb-1">To provide and maintain our service</li>
              <li className="mb-1">To verify your identity</li>
              <li className="mb-1">To issue and manage digital credentials</li>
              <li className="mb-1">To communicate with you about service-related matters</li>
              <li className="mb-1">To improve our application and user experience</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">4. Data Security</h3>
            <p className="text-sm mb-4">
              We have implemented appropriate security measures to prevent your personal data from being 
              accidentally lost, used, or accessed in an unauthorized way. We use encryption, secure storage, 
              and strict access controls to protect your data.
            </p>

            <h3 className="text-lg font-medium mt-6 mb-3">5. Your Rights</h3>
            <p className="text-sm mb-2">
              Under certain circumstances, you have rights under data protection laws in relation to your personal data:
            </p>
            <ul className="list-disc pl-5 text-sm mb-4">
              <li className="mb-1">The right to access your personal data</li>
              <li className="mb-1">The right to request correction of your personal data</li>
              <li className="mb-1">The right to request erasure of your personal data</li>
              <li className="mb-1">The right to object to processing of your personal data</li>
              <li className="mb-1">The right to request restriction of processing your personal data</li>
              <li className="mb-1">The right to data portability</li>
            </ul>

            <h3 className="text-lg font-medium mt-6 mb-3">6. Contact Us</h3>
            <p className="text-sm mb-4">
              If you have any questions about this privacy policy or our privacy practices, please contact us at:
              <br />
              <a href="mailto:privacy@sphyre.com" className="text-blue-600 hover:underline">privacy@sphyre.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}