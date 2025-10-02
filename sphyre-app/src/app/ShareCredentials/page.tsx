'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import CredentialItem from '@/components/ui/CredentialItem';

// Define interface for presentation request
interface PresentationRequest {
    type: string;
    verifier?: string;
    requestedCredentials?: string[];
    [key: string]: unknown;
}

export default function ShareCredentials() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [presentationRequest, setPresentationRequest] = useState<PresentationRequest | null>(null);
    const [selectedCredentials] = useState<number[]>([]);

    useEffect(() => {
        setMounted(true);

        // Retrieve presentation request from sessionStorage
        const storedPresentationRequest = sessionStorage.getItem('presentation_request');
        if (storedPresentationRequest) {
            try {
                const parsedRequest = JSON.parse(storedPresentationRequest);
                setPresentationRequest(parsedRequest);
                console.log('Retrieved presentation request:', parsedRequest);
            } catch (error) {
                console.error('Error parsing presentation request:', error);
            }
        }
    }, []);

    const handleBack = () => {
        router.back();
    };

    const credentials = [
        {
            id: 1,
            title: 'Lemura Employee Badge',
            domain: 'licha.org IDV',
            logo: '/assets/logo-licha.png',
            isOnline: true
        },
        {
            id: 2,
            title: 'NeptuneVisa Clearance VC',
            domain: 'licha.org IDV',
            logo: '/assets/logo-licha.png',
            isOnline: true
        },
        {
            id: 3,
            title: 'Nomadic Access Pass',
            domain: 'licha.org IDV',
            logo: '/assets/logo-licha.png',
            isOnline: true
        }
    ];

    const handleCredentialOptions = (credentialId: number) => {
        console.log(`Options clicked for credential ${credentialId}`);
        // Handle credential options menu
    };

    const handleCredentialClick = (credentialId: number) => {
        console.log(`Credential ${credentialId} clicked`);

        // Find the selected credential
        const selectedCredential = credentials.find(cred => cred.id === credentialId);

        if (selectedCredential) {
            // Store the selected credential in sessionStorage
            sessionStorage.setItem('selected_credential_for_sharing', JSON.stringify(selectedCredential));

            // Navigate to the PresentCredential page
            router.push('/PresentCredential');
        }
    };

    const handleSubmitPresentation = async () => {
        if (selectedCredentials.length === 0) {
            alert('Please select at least one credential to share');
            return;
        }

        try {
            console.log('Submitting presentation with credentials:', selectedCredentials);

            // In a real implementation, you would send the selected credentials
            // along with the presentation request to the verifier
            // For now, we'll simulate this with a timeout

            // Show loading state or spinner here

            // Simulate API call to submit presentation
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Clear the presentation request from sessionStorage
            sessionStorage.removeItem('presentation_request');

            alert('Credentials shared successfully!');
            router.push('/SSIWalletActivity');
        } catch (error) {
            console.error('Error sharing credentials:', error);
            alert('There was an error sharing your credentials. Please try again.');
        }
    };

    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-screen bg-white">
                <p className="text-gray-600">Loading...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white px-4 py-4 flex items-center border-b border-gray-200">
                <button
                    onClick={handleBack}
                    className="mr-4 p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <ChevronLeft size={24} className="text-gray-700" />
                </button>
                <h1 className="text-lg font-semibold text-gray-900">Share Credentials</h1>
            </div>

            {/* Presentation Request Information */}
            {presentationRequest ? (
                <div className="px-4 py-3 bg-green-50 border-l-4 border-green-500">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-green-800">
                                Presentation Request Received
                            </h3>
                            <div className="mt-2 text-sm text-green-700">
                                <p>
                                    {presentationRequest.verifier || 'A verifier'} is requesting you to share credentials.
                                </p>
                                <p className="mt-1">
                                    Please select the credentials you want to share.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="px-4 py-6">
                    <p className="text-gray-600 text-sm leading-relaxed">
                        You can share your information using the following options.
                    </p>
                </div>
            )}

            {/* Credentials List */}
            <div className="flex-1 px-4 space-y-4">
                {credentials.map((credential) => (
                    <div key={credential.id} className={`relative ${selectedCredentials.includes(credential.id) ? 'ring-2 ring-blue-500 rounded-lg' : ''}`}>
                        {selectedCredentials.includes(credential.id) && (
                            <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white rounded-full p-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            </div>
                        )}
                        <CredentialItem
                            key={credential.id}
                            id={credential.id}
                            title={credential.title}
                            domain={credential.domain}
                            logo={credential.logo}
                            isOnline={credential.isOnline}
                            onOptionsClick={handleCredentialOptions}
                            onClick={handleCredentialClick}
                        />
                    </div>
                ))}
            </div>

            {/* Submit Button - Only show when there's a presentation request */}
            {presentationRequest && (
                <div className="px-4 py-4 border-t border-gray-200 bg-white">
                    <button
                        onClick={handleSubmitPresentation}
                        disabled={selectedCredentials.length === 0}
                        className={`w-full py-3 px-4 rounded-full font-medium text-white ${
                            selectedCredentials.length > 0 
                                ? 'bg-blue-600 hover:bg-blue-700' 
                                : 'bg-gray-400 cursor-not-allowed'
                        } transition-colors`}
                    >
                        Share Selected Credentials
                    </button>
                    <p className="text-center text-sm text-gray-500 mt-2">
                        {selectedCredentials.length === 0 
                            ? 'Select at least one credential to share' 
                            : `${selectedCredentials.length} credential${selectedCredentials.length > 1 ? 's' : ''} selected`}
                    </p>
                </div>
            )}
        </div>
    );
}
