const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

export interface ConsentData {
  userDid: string;
  verifierDid: string;
  purpose: string;
  dataCategories: string;
  accessLevel: number;
  expiresAt?: number;
}

export interface ConsentResponse {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
}

export interface ConsentCheckResponse {
  userDid: string;
  verifierDid: string;
  purpose: string;
  isValid: boolean;
}

export const grantConsent = async (data: ConsentData): Promise<ConsentResponse> => {
  try {
    const response = await fetch(`${API_BASE}/api/blockchain/consent/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-DID': data.userDid,
      },
      body: JSON.stringify({
        userDid: data.userDid,
        verifierDid: data.verifierDid,
        purpose: data.purpose,
        dataCategories: data.dataCategories,
        accessLevel: data.accessLevel,
        expiresAt: data.expiresAt || 0,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to grant consent on blockchain');
    }

    const result: ConsentResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Error granting consent:', error);
    throw error;
  }
};

export const revokeConsent = async (
  userDid: string,
  verifierDid: string,
  purpose: string
): Promise<ConsentResponse> => {
  try {
    const response = await fetch(`${API_BASE}/api/blockchain/consent/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-DID': userDid,
      },
      body: JSON.stringify({
        userDid,
        verifierDid,
        purpose,
        dataCategories: '', 
        accessLevel: 0,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to revoke consent on blockchain');
    }

    const result: ConsentResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Error revoking consent:', error);
    throw error;
  }
};

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

export const getBasescanUrl = (txHash: string, network: 'mainnet' | 'sepolia' = 'sepolia'): string => {
  const baseUrl = network === 'mainnet' 
    ? 'https://basescan.org' 
    : 'https://sepolia.basescan.org';
  return `${baseUrl}/tx/${txHash}`;
};

export const ACCESS_LEVELS = {
  0: 'Read Only',
  1: 'Read & Write',
  2: 'Full Access',
  3: 'One-Time Access',
} as const;

export const formatGasUsed = (gasUsed: string): string => {
  const gas = parseInt(gasUsed, 10);
  if (isNaN(gas)) return gasUsed;
  return gas.toLocaleString();
};

const consentService = {
  grantConsent,
  revokeConsent,
  checkConsent,
  getBasescanUrl,
  ACCESS_LEVELS,
  formatGasUsed,
};

export default consentService;
