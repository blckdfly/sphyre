'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Calendar, User } from 'lucide-react';
import apiService from '@/services/apiService';
import walletService from '@/services/walletService';

interface Credential {
  id: string;
  credential_type: string;
  issuer_did: string;
  issuer_name?: string;
  issuedDate?: string;
  expiryDate?: string;
  status: string;
  credential_preview?: Record<string, unknown>;
}

export default function ShareCredentialsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string | null>(null);
  const [holderDID, setHolderDID] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load credentials from backend
  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const did = walletService.getCurrentDID();
        if (!did) {
          router.push('/onboarding');
          return;
        }
        setHolderDID(did);

        console.log('Loading credentials for DID:', did);
        const response = await apiService.getCredentials(did);
        
        if (response.success && response.data) {
          const data = response.data as Record<string, unknown>;
          const creds = (data.credentials || data.data || []) as Credential[];
          setCredentials(creds);
          console.log('Loaded', creds.length, 'credentials');
        } else {
          console.warn('No credentials found');
        }
      } catch (error) {
        console.error('Failed to load credentials:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (mounted) {
      loadCredentials();
    }
  }, [mounted, router]);

  const handleBack = () => {
    router.push('/SSIWalletIdentity');
  };

  const handleCredentialSelect = (credentialId: string) => {
    setSelectedCredentialId(credentialId);
  };

  const handlePresentCredential = () => {
    if (!selectedCredentialId) {
      alert('Please select a credential to present');
      return;
    }

    const selectedCredential = credentials.find(cred => cred.id === selectedCredentialId);
    if (selectedCredential) {
      sessionStorage.setItem('selected_credential_for_sharing', JSON.stringify(selectedCredential));
      sessionStorage.setItem('holder_did_for_presentation', holderDID);
   
      const mockVerifierRequirements = {
        verifier_name: 'In-Person Verifier',
        verifier_did: 'did:alyra:verifier:inperson',
        purpose: 'In-person identity verification',
        mandatory_attributes: ['full_name', 'date_of_birth'],
        optional_attributes: ['address', 'phone', 'email'], 
      };
      sessionStorage.setItem('verifier_requirements', JSON.stringify(mockVerifierRequirements));
      
      console.log('Selected credential for sharing:', selectedCredential.credential_type);

      router.push('/PresentCredential');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'expired': return 'bg-yellow-100 text-yellow-700';
      case 'revoked': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-light-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-dark-300">Loading credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-50">
      <div className="bg-white px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center">
          <button onClick={handleBack} className="mr-3">
            <ChevronLeft size={24} className="text-dark-500" />
          </button>
          <div>
            <h1 className="text-lg font-medium text-dark-500">Share Credential</h1>
            <p className="text-xs text-dark-300">Select credential to present</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 pb-32">
        {credentials.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-dark-300 mb-4">No credentials available</p>
            <p className="text-sm text-dark-300">
              Request credentials from issuers first
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {credentials.map((credential) => (
                <div
                  key={credential.id}
                  onClick={() => handleCredentialSelect(credential.id)}
                  className={`
                    relative bg-white rounded-lg border-2 p-4 cursor-pointer transition-all
                    ${selectedCredentialId === credential.id
                      ? 'border-primary-500 bg-primary-50 shadow-lg'
                      : 'border-dark-100 hover:border-primary-300 hover:shadow-md'
                    }
                  `}
                >
                  {selectedCredentialId === credential.id && (
                    <div className="absolute top-4 right-4 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}

                  <div className="flex items-start pr-10">

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-dark-500 mb-1">
                        {credential.credential_type}
                      </h3>

                      <div className="flex items-center text-sm text-dark-300 mb-2">
                        <User size={14} className="mr-1" />
                        <span className="truncate">
                          {credential.issuer_name || credential.issuer_did?.substring(0, 30) + '...'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(credential.status)}`}>
                          {credential.status || 'Active'}
                        </span>
                        {credential.issuedDate && (
                          <div className="flex items-center text-xs text-dark-300">
                            <Calendar size={12} className="mr-1" />
                            <span>Issued {new Date(credential.issuedDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      {/* Attributes preview */}
                      {credential.credential_preview && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {Object.keys(credential.credential_preview).slice(0, 3).map((key, index) => (
                            <span key={index} className="text-xs px-2 py-1 bg-light-200 text-dark-400 rounded">
                              {key.replace(/_/g, ' ')}
                            </span>
                          ))}
                          {Object.keys(credential.credential_preview).length > 3 && (
                            <span className="text-xs px-2 py-1 bg-light-200 text-dark-400 rounded">
                              +{Object.keys(credential.credential_preview).length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {credentials.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white">
          <button
            onClick={handlePresentCredential}
            disabled={!selectedCredentialId}
            className={`
              w-full py-4 rounded-lg font-medium text-white flex items-center justify-center gap-2 transition-all
              ${selectedCredentialId
                ? 'bg-primary-500 hover:bg-primary-600 active:scale-95 shadow-lg'
                : 'bg-dark-200 cursor-not-allowed'
              }
            `}
          >
            Present Selected Credential
          </button>
        </div>
      )}
    </div>
  );
}
