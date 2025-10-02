'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

// Define interface for credential offer
interface CredentialSubject {
    givenName?: string;
    surname?: string;
    gender?: 'male' | 'female';
    placeOfBirth?: string;
    dateOfBirth?: string;
    nationality?: string;
    [key: string]: unknown;
}

interface CredentialOffer {
    type: string;
    name?: string;
    issuer?: string;
    credentialSubject?: CredentialSubject;
    [key: string]: unknown;
}

export default function IdentityVerificationPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [credentialOffer, setCredentialOffer] = useState<CredentialOffer | null>(null);
    const [formData, setFormData] = useState({
        givenName: '',
        surname: '',
        gender: 'male',
        placeOfBirth: '',
        dateOfBirth: '',
        nationality: '',
    });

    useEffect(() => {
        setMounted(true);

        // Retrieve credential offer from sessionStorage
        const storedCredentialOffer = sessionStorage.getItem('credential_offer');
        if (storedCredentialOffer) {
            try {
                const parsedOffer = JSON.parse(storedCredentialOffer);
                setCredentialOffer(parsedOffer);
                console.log('Retrieved credential offer:', parsedOffer);

                // Pre-fill form data if the credential offer contains relevant information
                if (parsedOffer.credentialSubject) {
                    const subject = parsedOffer.credentialSubject;
                    setFormData(prevData => ({
                        ...prevData,
                        givenName: subject.givenName || prevData.givenName,
                        surname: subject.surname || prevData.surname,
                        gender: subject.gender || prevData.gender,
                        placeOfBirth: subject.placeOfBirth || prevData.placeOfBirth,
                        dateOfBirth: subject.dateOfBirth || prevData.dateOfBirth,
                        nationality: subject.nationality || prevData.nationality
                    }));
                }
            } catch (error) {
                console.error('Error parsing credential offer:', error);
            }
        }
    }, []);

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleGenderChange = (gender: 'male' | 'female') => {
        setFormData(prev => ({ ...prev, gender }));
    };


    const handleSubmit = async () => {
        // Validate form
        if (!formData.givenName || !formData.surname || !formData.placeOfBirth ||
            !formData.dateOfBirth) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            // If we have a credential offer, store it in sessionStorage for later use
            if (credentialOffer) {
                console.log('Storing credential offer with form data for later acceptance');
                sessionStorage.setItem('credential_offer_pending', JSON.stringify(credentialOffer));
            }

            // Store form data in sessionStorage for use in subsequent pages
            const storedFormData = sessionStorage.getItem('identity_verification_form');
            let completeFormData = storedFormData ? JSON.parse(storedFormData) : {};
            completeFormData = {
                ...completeFormData,
                givenName: formData.givenName,
                surname: formData.surname,
                gender: formData.gender,
                placeOfBirth: formData.placeOfBirth,
                dateOfBirth: formData.dateOfBirth,
                nationality: formData.nationality
            };
            sessionStorage.setItem('identity_verification_form', JSON.stringify(completeFormData));

            // Navigate to nationality selection page
            router.push('/NationalitySelection');
        } catch (error) {
            console.error('Error processing form:', error);
            alert('There was an error processing your information. Please try again.');
        }
    };

    const handleBack = () => {
        router.push('/SSIWalletIdentity');
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
                <h1 className="text-lg font-semibold text-black">Identity Verification</h1>
            </div>

            {/* Credential Offer Information */}
            {credentialOffer && (
                <div className="px-4 py-3 bg-blue-50 border-l-4 border-blue-500">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-blue-800">
                                Credential Offer Received
                            </h3>
                            <div className="mt-2 text-sm text-blue-700">
                                <p>
                                    {credentialOffer.name || 'A credential'} is being offered to you by {credentialOffer.issuer || 'an issuer'}.
                                </p>
                                <p className="mt-1">
                                    Please complete the form below to receive your credential.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Form */}
            <div className="px-4 py-6 space-y-6">
                {/* Given Name */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-black">Given Name</label>
                    <input
                        type="text"
                        value={formData.givenName}
                        onChange={(e) => handleInputChange('givenName', e.target.value)}
                        className="w-full px-3 py-3 bg-gray-100 border border-gray-300 rounded-lg text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter your given name"
                    />
                </div>

                {/* Surname */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-black">Surname</label>
                    <input
                        type="text"
                        value={formData.surname}
                        onChange={(e) => handleInputChange('surname', e.target.value)}
                        className="w-full px-3 py-3 bg-gray-100 border border-gray-300 rounded-lg text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter your surname"
                    />
                </div>

                {/* Gender */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-black">Gender</label>
                    <div className="flex space-x-4">
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name="gender"
                                value="male"
                                checked={formData.gender === 'male'}
                                onChange={() => handleGenderChange('male')}
                                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-black">Male</span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name="gender"
                                value="female"
                                checked={formData.gender === 'female'}
                                onChange={() => handleGenderChange('female')}
                                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-black">Female</span>
                        </label>
                    </div>
                </div>

                {/* Place of Birth */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-black">Place of Birth</label>
                    <input
                        type="text"
                        value={formData.placeOfBirth}
                        onChange={(e) => handleInputChange('placeOfBirth', e.target.value)}
                        className="w-full px-3 py-3 bg-gray-100 border border-gray-300 rounded-lg text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter your place of birth"
                    />
                </div>

                {/* Date of Birth */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-black">Date of Birth</label>
                    <input
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                        className="w-full px-3 py-3 bg-gray-100 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                        style={{ maxWidth: '100%' }}
                    />
                </div>



                {/* Submit Button */}
                <div className="pt-4">
                    <button
                        onClick={handleSubmit}
                        className="w-full bg-blue-600 text-white py-4 rounded-full font-medium text-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                        disabled={!formData.givenName || !formData.surname || !formData.placeOfBirth ||
                            !formData.dateOfBirth}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
