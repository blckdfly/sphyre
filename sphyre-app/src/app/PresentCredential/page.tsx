'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

// Define interface for credential
interface Credential {
  id: number;
  title: string;
  domain: string;
  logo: string;
  isOnline: boolean;
}

export default function PresentCredentialPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null);
  const [issuedDate, setIssuedDate] = useState<string>('');
  const [qrPattern, setQrPattern] = useState<boolean[]>([]);

  useEffect(() => {
    setMounted(true);

    // Get the selected credential from sessionStorage
    const storedCredential = sessionStorage.getItem('selected_credential_for_sharing');
    if (storedCredential) {
      try {
        const parsedCredential = JSON.parse(storedCredential);
        setSelectedCredential(parsedCredential);

        // Set a sample issued date (in a real app, this would come from the credential)
        setIssuedDate(new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }));

        // Generate a consistent QR pattern based on the credential ID
        // This ensures the same credential always shows the same QR pattern
        const credentialId = parsedCredential.id || 0;
        const seed = credentialId * 1000; // Use credential ID as seed
        const pattern = Array.from({ length: 25 }, (_, index) => {
          // Use a simple hash function to determine if a cell should be filled
          const hash = (seed + index * 17) % 100;
          return hash < 40; // 40% chance of being filled
        });
        setQrPattern(pattern);
      } catch (error) {
        console.error('Error parsing stored credential:', error);
      }
    } else {
      // If no credential is selected, go back to selection page
      router.push('/ShareCredentials');
    }
  }, [router]);

  const handleBack = () => {
    router.push('/ShareCredentials');
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <p className="text-black">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center border-b border-gray-200">
        <button onClick={handleBack} className="mr-3">
          <ArrowLeft size={24} className="text-black" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-black">Present Credential</h1>
          {selectedCredential && (
            <p className="text-sm text-gray-500">{selectedCredential.title}</p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        <h2 className="text-2xl font-bold text-center mb-8">Start Present</h2>

        {/* QR Code */}
        <div className="relative w-64 h-64 mb-8">
          {/* This is a placeholder for the QR code. In a real app, you would generate a QR code */}
          <div className="w-full h-full border-2 border-gray-300 rounded-lg flex flex-col items-center justify-center bg-gray-100">
            <div className="grid grid-cols-5 grid-rows-5 gap-1 p-4">
              {/* Simple QR code representation */}
              {qrPattern.map((isFilled, index) => (
                <div 
                  key={index} 
                  className={`w-8 h-8 ${isFilled ? 'bg-black' : 'bg-transparent'}`}
                ></div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">QR Code for one-time sharing</p>
          </div>
        </div>

        {/* Issued Date */}
        <div className="text-center mb-4">
          <p className="text-sm text-gray-500">Issued Date</p>
          <p className="text-base font-medium">{issuedDate}</p>
        </div>

        {/* Explanation Text */}
        <div className="text-center max-w-xs">
          <p className="text-sm text-gray-600">
            This QR will establish one-time sharing connection
          </p>
        </div>
      </div>
    </div>
  );
}
