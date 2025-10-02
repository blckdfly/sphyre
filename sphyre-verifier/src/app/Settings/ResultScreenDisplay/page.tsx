'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import HeaderWithBack from '@/components/ui/HeaderWithBack';

const ResultScreenDisplayPage: React.FC = () => {
    const router = useRouter();
    const [selectedOption, setSelectedOption] = useState<string>('detailed');

    const handleOptionChange = (option: string) => {
        setSelectedOption(option);
    };

    return (
        <div className="min-h-screen bg-black">
            {/* Header */}
            <HeaderWithBack 
                title="Result Screen Display" 
                onBackClick={() => router.back()}
            />

            {/* Content */}
            <div className="flex-grow bg-white px-4 pt-6 pb-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Result Screen Display</h2>
                    <p className="text-gray-500 text-sm mb-6">
                        Choose how verification results are displayed
                    </p>
                    
                    <div className="space-y-4">
                        {/* Detailed Option */}
                        <div 
                            className={`border p-4 ${selectedOption === 'detailed' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                            onClick={() => handleOptionChange('detailed')}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-medium text-gray-900">Detailed View</h3>
                                <div className={`w-5 h-5 rounded-full border ${selectedOption === 'detailed' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'} flex items-center justify-center`}>
                                    {selectedOption === 'detailed' && (
                                        <div className="w-2 h-2 rounded-full bg-white"></div>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm text-gray-600">
                                Shows all credential details and verification status
                            </p>
                            
                            {/* Preview */}
                            <div className="mt-3 bg-white border border-gray-200 p-3">
                                <div className="w-full h-24 bg-gray-100 flex flex-col items-center justify-center">
                                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-1">
                                        <div className="w-8 h-8 bg-green-500 rounded-full"></div>
                                    </div>
                                    <div className="w-3/4 h-2 bg-gray-300 rounded-full"></div>
                                    <div className="w-1/2 h-2 bg-gray-300 rounded-full mt-1"></div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Simple Option */}
                        <div 
                            className={`border p-4 ${selectedOption === 'simple' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                            onClick={() => handleOptionChange('simple')}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-medium text-gray-900">Simple View</h3>
                                <div className={`w-5 h-5 rounded-full border ${selectedOption === 'simple' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'} flex items-center justify-center`}>
                                    {selectedOption === 'simple' && (
                                        <div className="w-2 h-2 rounded-full bg-white"></div>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm text-gray-600">
                                Shows only verification status (success/failure)
                            </p>
                            
                            {/* Preview */}
                            <div className="mt-3 bg-white border border-gray-200 p-3">
                                <div className="w-full h-24 bg-gray-100 flex items-center justify-center">
                                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                                        <div className="w-8 h-8 bg-green-500 rounded-full"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Minimal Option */}
                        <div 
                            className={`border p-4 ${selectedOption === 'minimal' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                            onClick={() => handleOptionChange('minimal')}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-medium text-gray-900">Minimal View</h3>
                                <div className={`w-5 h-5 rounded-full border ${selectedOption === 'minimal' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'} flex items-center justify-center`}>
                                    {selectedOption === 'minimal' && (
                                        <div className="w-2 h-2 rounded-full bg-white"></div>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm text-gray-600">
                                Shows only a color indicator (green/red)
                            </p>
                            
                            {/* Preview */}
                            <div className="mt-3 bg-white border border-gray-200 p-3">
                                <div className="w-full h-24 bg-gray-100 flex items-center justify-center">
                                    <div className="w-12 h-12 bg-green-500 rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-8">
                        <button 
                            className="w-full bg-blue-600 text-white rounded-xl p-4 font-medium hover:bg-blue-700 transition-colors"
                            onClick={() => router.back()}
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResultScreenDisplayPage;