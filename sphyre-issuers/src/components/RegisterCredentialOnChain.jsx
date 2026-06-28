import React, { useState } from 'react';
import issuerMetaTxService from '../services/metaTxService';

export default function RegisterCredentialOnChain({ 
  credential,
  onSuccess,
  onError,
  autoRegister = false 
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const [registered, setRegistered] = useState(false);

  React.useEffect(() => {
    if (autoRegister && !registered && credential) {
      handleRegister();
    }
  }, [autoRegister, credential]);

  const handleRegister = async () => {
    if (!credential) {
      setStatus('Error: Credential data missing');
      onError?.('Credential data missing');
      return;
    }

    setLoading(true);
    setStatus('Sending to backend relayer...');

    try {
      const result = await issuerMetaTxService.registerCredential(
        null,
        credential.subjectDID || credential.did,
        credential.hash || credential.credentialHash,
        credential.ipfsUri || credential.metadataUri || `ipfs://${credential.ipfsHash}`
      );

      if (result.success && result.tx_hash) {
        setStatus('Credential registered on blockchain!');
        setTxHash(result.tx_hash);
        setRegistered(true);
        onSuccess?.(result.tx_hash);
      } else {
        throw new Error(result.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Blockchain registration error:', error);
      setStatus(`Error: ${error.message}`);
      onError?.(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="flex-1">
            <h4 className="font-semibold text-green-900">
              Credential Registered On-Chain
            </h4>
            <p className="text-sm text-green-700 mt-1">
              The credential has been anchored on the blockchain.
            </p>
            {txHash && (
              <a
                href={`https://sepolia.basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline mt-2 inline-block"
              >
                View Transaction
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-gray-900 mb-3">
        Blockchain Anchoring
      </h4>
      
      <p className="text-sm text-gray-600 mb-4">
        Register this credential on the blockchain for immutable verification.
        <strong className="text-green-600"> Zero gas fees - backend relayer pays everything!</strong>
      </p>

      <button
        onClick={handleRegister}
        disabled={loading}
        className={`
          w-full px-4 py-3 rounded-lg font-semibold text-white
          transition-all duration-200 flex items-center justify-center space-x-2
          ${loading 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
          }
        `}
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            <span>Registering...</span>
          </>
        ) : (
          <>
            <span>Register On-Chain</span>
            <span className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded">
              FREE
            </span>
          </>
        )}
      </button>

      {status && (
        <div className={`
          mt-4 p-3 rounded-lg text-sm
          ${status.includes('Error') || status.includes('Failed')
            ? 'bg-red-50 border border-red-200 text-red-800' 
            : status.includes('Success')
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-blue-50 border border-blue-200 text-blue-800'
          }
        `}>
          {status}
        </div>
      )}
    </div>
  );
}
