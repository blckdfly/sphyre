'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';

// Sample country data with flags
// In a real application, you would fetch this from an API or import from a more complete dataset
const countries = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
];

export default function NationalitySelectionPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);

    // Retrieve any previously selected nationality from sessionStorage
    const storedFormData = sessionStorage.getItem('identity_verification_form');
    if (storedFormData) {
      try {
        const parsedData = JSON.parse(storedFormData);
        if (parsedData.nationality) {
          setSelectedCountry(parsedData.nationality);
        }
      } catch (error) {
        console.error('Error parsing stored form data:', error);
      }
    }
  }, []);

  const filteredCountries = countries.filter(country => 
    country.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCountrySelect = (countryName: string) => {
    setSelectedCountry(countryName);

    // Store the selected nationality in sessionStorage
    const storedFormData = sessionStorage.getItem('identity_verification_form');
    const formData = storedFormData ? JSON.parse(storedFormData) : {};
    formData.nationality = countryName;
    sessionStorage.setItem('identity_verification_form', JSON.stringify(formData));
  };

  const handleContinue = () => {
    if (selectedCountry) {
      router.push('/VerificationMethodSelection');
    }
  };

  const handleBack = () => {
    router.push('/IdentityVerification');
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
        <h1 className="text-lg font-semibold text-black">Nationality Selection</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6 space-y-6">
        <h2 className="text-xl font-semibold text-black text-center">
          Select Country of Residence
        </h2>

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={20} className="text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-3 bg-gray-100 border border-gray-300 rounded-lg text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search countries"
          />
        </div>

        {/* Country List */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filteredCountries.map((country) => (
            <button
              key={country.code}
              onClick={() => handleCountrySelect(country.name)}
              className={`w-full flex items-center p-3 rounded-lg transition-colors ${
                selectedCountry === country.name
                  ? 'bg-blue-50 border border-blue-500'
                  : 'bg-white border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="text-2xl mr-3">{country.flag}</span>
              <span className="text-black">{country.name}</span>
            </button>
          ))}
        </div>

        {/* Continue Button */}
        <div className="pt-4">
          <button
            onClick={handleContinue}
            className={`w-full py-4 rounded-full font-medium text-lg transition-colors ${
              selectedCountry
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            disabled={!selectedCountry}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
