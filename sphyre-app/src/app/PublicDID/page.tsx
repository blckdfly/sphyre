'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Key, Copy, Eye, EyeOff, RefreshCw, Shield, AlertTriangle } from 'lucide-react';

export default function PublicDIDPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Sample DID data
  const [didData, setDidData] = useState({
    did: 'did:sphyre:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    method: 'sphyre',
    created: '2023-09-15T10:30:00Z',
    lastUsed: '2023-10-28T14:45:00Z',
    status: 'active',
    privateKey: '8f45a3d9c27b3e432f6b1d7c9b8c9a1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7'
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBack = () => {
    router.push('/UserProfile');
  };

  const handleCopyDID = () => {
    navigator.clipboard.writeText(didData.did)
      .then(() => {
        alert('DID copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy DID: ', err);
        alert('Failed to copy DID');
      });
  };

  const handleCopyPrivateKey = () => {
    if (!showPrivateKey) {
      alert('Please reveal the private key first');
      return;
    }

    navigator.clipboard.writeText(didData.privateKey)
      .then(() => {
        alert('Private key copied to clipboard. Keep it secure!');
      })
      .catch(err => {
        console.error('Failed to copy private key: ', err);
        alert('Failed to copy private key');
      });
  };

  const handleRotateKey = () => {
    const confirmRotate = window.confirm(
      'Are you sure you want to rotate your DID key? This will generate a new private key and update your DID. ' +
      'This action cannot be undone and may affect your existing credentials.'
    );
    
    if (confirmRotate) {
      setIsRefreshing(true);
      
      // Simulate key rotation
      setTimeout(() => {
        // Generate a new "private key" (just for demonstration)
        const newPrivateKey = Array.from({ length: 64 }, () => 
          Math.floor(Math.random() * 16).toString(16)
        ).join('');
        
        // Update the DID data
        setDidData(prev => ({
          ...prev,
          privateKey: newPrivateKey,
          created: new Date().toISOString(),
          lastUsed: new Date().toISOString()
        }));
        
        setIsRefreshing(false);
        setShowPrivateKey(false);
        
        alert('DID key rotated successfully. Please backup your new private key.');
      }, 2000);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        <h1 className="text-lg font-semibold text-black">Public DID</h1>
      </div>

      {/* DID Information */}
      <div className="px-4 py-6">
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
          <div className="flex items-center mb-4">
            <Key size={20} className="text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Your Decentralized Identifier</h2>
          </div>
          
          <div className="bg-gray-100 rounded-lg p-4 mb-4">
            <div className="flex items-start justify-between">
              <p className="text-sm text-gray-700 break-all pr-2">{didData.did}</p>
              <button 
                onClick={handleCopyDID}
                className="p-1.5 rounded-full text-blue-600 hover:bg-blue-100 flex-shrink-0"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-xs text-gray-500 mb-1">Method</p>
              <p className="text-sm font-medium text-gray-900">{didData.method}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <p className="text-sm font-medium text-gray-900 capitalize">{didData.status}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Created</p>
              <p className="text-sm font-medium text-gray-900">{formatDate(didData.created)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Last Used</p>
              <p className="text-sm font-medium text-gray-900">{formatDate(didData.lastUsed)}</p>
            </div>
          </div>
          
          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={handleRotateKey}
              disabled={isRefreshing}
              className={`w-full flex items-center justify-center py-2.5 rounded-lg text-sm font-medium ${
                isRefreshing 
                  ? 'bg-gray-200 text-gray-500' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isRefreshing ? (
                <>
                  <RefreshCw size={16} className="mr-2 animate-spin" />
                  Rotating Key...
                </>
              ) : (
                <>
                  <RefreshCw size={16} className="mr-2" />
                  Rotate DID Key
                </>
              )}
            </button>
          </div>
        </div>

        {/* Private Key Section */}
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Shield size={20} className="text-red-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Private Key</h2>
            </div>
            <button 
              onClick={() => setShowPrivateKey(!showPrivateKey)}
              className="p-1.5 rounded-full text-gray-600 hover:bg-gray-100"
            >
              {showPrivateKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          
          <div className="bg-red-50 rounded-lg p-4 mb-4">
            <div className="flex items-center mb-2">
              <AlertTriangle size={16} className="text-red-600 mr-2" />
              <p className="text-sm font-medium text-red-600">Security Warning</p>
            </div>
            <p className="text-xs text-red-700">
              Your private key is sensitive information. Never share it with anyone. 
              If someone gains access to your private key, they can control your digital identity.
            </p>
          </div>
          
          <div className="bg-gray-100 rounded-lg p-4 mb-4">
            <div className="flex items-start justify-between">
              <p className="text-sm text-gray-700 break-all pr-2 font-mono">
                {showPrivateKey 
                  ? didData.privateKey 
                  : '•'.repeat(Math.min(64, didData.privateKey.length))}
              </p>
              <button 
                onClick={handleCopyPrivateKey}
                className="p-1.5 rounded-full text-blue-600 hover:bg-blue-100 flex-shrink-0"
                disabled={!showPrivateKey}
              >
                <Copy size={16} className={!showPrivateKey ? 'opacity-50' : ''} />
              </button>
            </div>
          </div>
          
          <p className="text-xs text-gray-500 italic">
            We recommend storing your private key in a secure password manager or offline in a secure location.
          </p>
        </div>

        {/* DID Document Section */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">DID Document</h2>
            <button 
              onClick={() => alert('DID Document downloaded')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Download JSON
            </button>
          </div>
          
          <div className="bg-gray-100 rounded-lg p-4 overflow-x-auto">
            <pre className="text-xs text-gray-700 font-mono">
{`{
  "@context": "https://www.w3.org/ns/did/v1",
  "id": "${didData.did}",
  "verificationMethod": [
    {
      "id": "${didData.did}#keys-1",
      "type": "Ed25519VerificationKey2020",
      "controller": "${didData.did}",
      "publicKeyMultibase": "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"
    }
  ],
  "authentication": [
    "${didData.did}#keys-1"
  ],
  "assertionMethod": [
    "${didData.did}#keys-1"
  ],
  "created": "${didData.created}",
  "updated": "${didData.lastUsed}"
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}