'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, FileText, Car, Home } from 'lucide-react';

// Define verification method types
type VerificationMethod = 'passport' | 'driverLicense' | 'identityCard' | 'residencePermit';

interface VerificationMethodOption {
  id: VerificationMethod;
  name: string;
  icon: React.ReactNode;
  description: string;
}

// Verification method options
const verificationMethods: VerificationMethodOption[] = [
  {
    id: 'passport',
    name: 'Passport',
    icon: <FileText size={24} />,
    description: "International travel document issued by a country's government"
  },
  {
    id: 'driverLicense',
    name: 'Driver License',
    icon: <Car size={24} />,
    description: 'Official document permitting an individual to operate vehicles'
  },
  {
    id: 'identityCard',
    name: 'Identity Card',
    icon: <CreditCard size={24} />,
    description: 'Official document issued to citizens for identification purposes'
  },
  {
    id: 'residencePermit',
    name: 'Residence Permit',
    icon: <Home size={24} />,
    description: 'Document confirming the right to live in a specific country'
  }
];

export default function VerificationMethodSelectionPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<VerificationMethod | null>(null);

  useEffect(() => {
    setMounted(true);

    // Retrieve any previously selected verification method from sessionStorage
    const storedFormData = sessionStorage.getItem('identity_verification_form');
    if (storedFormData) {
      try {
        const parsedData = JSON.parse(storedFormData);
        if (parsedData.verificationMethod) {
          setSelectedMethod(parsedData.verificationMethod as VerificationMethod);
        }
      } catch (error) {
        console.error('Error parsing stored form data:', error);
      }
    }
  }, []);

  const handleMethodSelect = (methodId: VerificationMethod) => {
    setSelectedMethod(methodId);

    // Store the selected method in sessionStorage
    const storedFormData = sessionStorage.getItem('identity_verification_form');
    const formData = storedFormData ? JSON.parse(storedFormData) : {};
    formData.verificationMethod = methodId;
    sessionStorage.setItem('identity_verification_form', JSON.stringify(formData));
  };

  const handleContinue = () => {
    if (selectedMethod) {
      router.push('/PhotoUpload');
    }
  };

  const handleBack = () => {
    router.push('/NationalitySelection');
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <p className="text-black">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center border-b border-gray-200">
        <button onClick={handleBack} className="mr-3">
          <ArrowLeft size={24} className="text-black" />
        </button>
        <h1 className="text-lg font-semibold text-black">Verification Method</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6 space-y-6">
        <h2 className="text-xl font-semibold text-black text-center">
          Choose Verification Method
        </h2>

        <p className="text-gray-600 text-center">
          Select the type of document you want to use for identity verification
        </p>

        {/* Verification Method Options */}
        <div className="space-y-3">
          {verificationMethods.map((method) => (
            <button
              key={method.id}
              onClick={() => handleMethodSelect(method.id)}
              className={`w-full flex items-center p-4 rounded-lg transition-colors ${
                selectedMethod === method.id
                  ? 'bg-blue-50 border border-blue-500'
                  : 'bg-white border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className={`p-2 rounded-full mr-3 ${
                selectedMethod === method.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {method.icon}
              </div>
              <div className="text-left">
                <div className="font-medium text-black">{method.name}</div>
                <div className="text-sm text-gray-500">{method.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Continue Button */}
        <div className="pt-4">
          <button
            onClick={handleContinue}
            className={`w-full py-4 rounded-full font-medium text-lg transition-colors ${
              selectedMethod
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            disabled={!selectedMethod}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
