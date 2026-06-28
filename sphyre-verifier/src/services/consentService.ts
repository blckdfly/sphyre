const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

export interface ConsentCheckResponse {
  userDid: string;
  verifierDid: string;
  purpose: string;
  isValid: boolean;
}

export const checkConsent = async (
  userDid: string,
  verifierDid: string,
  purpose: string
): Promise<ConsentCheckResponse> => {
  try {
    const response = await fetch(
      `${API_BASE}/api/blockchain/consent/check/${encodeURIComponent(userDid)}/${encodeURIComponent(verifierDid)}/${encodeURIComponent(purpose)}`
    );

    if (!response.ok) {
      throw new Error('Failed to check consent on blockchain');
    }

    const result: ConsentCheckResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Error checking consent:', error);
    throw error;
  }
};

export const verifyWithConsentCheck = async (
  userDid: string,
  verifierDid: string,
  purpose: string = 'credential_verification'
): Promise<boolean> => {
  try {
    const consent = await checkConsent(userDid, verifierDid, purpose);
    
    if (!consent.isValid) {
      throw new Error('User has not granted consent for verification');
    }
    
    return true;
  } catch (error) {
    console.error('Consent check failed:', error);
    throw error;
  }
};

export const getBasescanUrl = (txHash: string, network: 'mainnet' | 'sepolia' = 'sepolia'): string => {
  const baseUrl = network === 'mainnet' 
    ? 'https://basescan.org' 
    : 'https://sepolia.basescan.org';
  return `${baseUrl}/tx/${txHash}`;
};

const consentService = {
  checkConsent,
  verifyWithConsentCheck,
  getBasescanUrl,
};

export default consentService;
