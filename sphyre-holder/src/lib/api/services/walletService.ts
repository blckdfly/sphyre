import { api } from '../client';
import { API_ENDPOINTS } from '../config';

export interface WalletCredential {
  id: string;
  type: string[];
  issuer: {
    id: string;
    name: string;
  };
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: Record<string, unknown>;
  status: 'active' | 'revoked' | 'expired';
  proof: Record<string, unknown>;
}

export interface VerifiablePresentation {
  id: string;
  type: string[];
  verifiableCredential: WalletCredential[];
  holder: string;
  proof: Record<string, unknown>;
}

export interface Connection {
  id: string;
  name: string;
  did: string;
  avatar?: string;
  connectionType: 'issuer' | 'verifier';
  createdAt: string;
  lastActivity?: string;
}

export interface PresentationOffer {
  id: string;
  verifierDid: string;
  verifierName: string;
  requestedCredentials: Array<{
    type: string;
    attributes: string[];
    required: boolean;
  }>;
  purpose: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

export const walletService = {
  // Credential Management
  async getCredentials(token?: string): Promise<WalletCredential[]> {
    return api.get<WalletCredential[]>(API_ENDPOINTS.WALLET.CREDENTIALS, { token });
  },

  async getCredential(credentialId: string, token?: string): Promise<WalletCredential> {
    return api.get<WalletCredential>(`${API_ENDPOINTS.WALLET.CREDENTIALS}/${credentialId}`, { token });
  },

  async deleteCredential(credentialId: string, token?: string): Promise<void> {
    return api.delete<void>(`${API_ENDPOINTS.WALLET.CREDENTIALS}/${credentialId}`, { token });
  },

  async importCredential(credential: unknown, token?: string): Promise<WalletCredential> {
    return api.post<WalletCredential>(`${API_ENDPOINTS.WALLET.CREDENTIALS}/import`, credential, { token });
  },

  // Presentation Management
  async createPresentation(
    credentialIds: string[],
    challenge: string,
    domain: string,
    token?: string
  ): Promise<VerifiablePresentation> {
    return api.post<VerifiablePresentation>(API_ENDPOINTS.WALLET.PRESENTATIONS, {
      credentialIds,
      challenge,
      domain
    }, { token });
  },

  async getPresentations(token?: string): Promise<VerifiablePresentation[]> {
    return api.get<VerifiablePresentation[]>(API_ENDPOINTS.WALLET.PRESENTATIONS, { token });
  },

  async submitPresentation(
    presentationRequestId: string,
    credentialIds: string[],
    token?: string
  ): Promise<{ success: boolean; message?: string }> {
    return api.post<{ success: boolean; message?: string }>(
      `${API_ENDPOINTS.WALLET.PRESENTATIONS}/submit`,
      { presentationRequestId, credentialIds },
      { token }
    );
  },

  // Connection Management
  async getConnections(token?: string): Promise<Connection[]> {
    return api.get<Connection[]>(API_ENDPOINTS.WALLET.CONNECTIONS, { token });
  },

  async addConnection(did: string, name: string, connectionType: 'issuer' | 'verifier', token?: string): Promise<Connection> {
    return api.post<Connection>(API_ENDPOINTS.WALLET.CONNECTIONS, {
      did,
      name,
      connectionType
    }, { token });
  },

  async removeConnection(connectionId: string, token?: string): Promise<void> {
    return api.delete<void>(`${API_ENDPOINTS.WALLET.CONNECTIONS}/${connectionId}`, { token });
  },

  // QR Code Scanning and Processing
  async processQRCode(qrData: string, token?: string): Promise<{
    type: 'credential_offer' | 'presentation_request' | 'connection_request';
    data: unknown;
    metadata: {
      issuer?: string;
      verifier?: string;
      expiresAt?: string;
    };
  }> {
    return api.post('/api/wallet/qr/process', { qrData }, { token });
  },

  async acceptCredentialOffer(offerId: string, token?: string): Promise<WalletCredential> {
    return api.post<WalletCredential>('/api/wallet/offers/accept', { offerId }, { token });
  },

  async rejectCredentialOffer(offerId: string, reason?: string, token?: string): Promise<void> {
    return api.post('/api/wallet/offers/reject', { offerId, reason }, { token });
  },

  // Presentation Requests
  async getPresentationOffers(token?: string): Promise<PresentationOffer[]> {
    return api.get<PresentationOffer[]>('/api/wallet/presentation-offers', { token });
  },

  async acceptPresentationRequest(
    requestId: string,
    selectedCredentials: string[],
    token?: string
  ): Promise<{ success: boolean; message?: string }> {
    return api.post<{ success: boolean; message?: string }>(
      '/api/wallet/presentation-requests/accept',
      { requestId, selectedCredentials },
      { token }
    );
  },

  async rejectPresentationRequest(
    requestId: string,
    reason?: string,
    token?: string
  ): Promise<void> {
    return api.post('/api/wallet/presentation-requests/reject', { requestId, reason }, { token });
  },

  // Backup and Recovery
  async exportWallet(password: string, token?: string): Promise<{
    encryptedWallet: string;
    backupDate: string;
  }> {
    return api.post('/api/wallet/export', { password }, { token });
  },

  async importWallet(encryptedWallet: string, password: string, token?: string): Promise<{
    success: boolean;
    credentialsImported: number;
    connectionsImported: number;
  }> {
    return api.post('/api/wallet/import', { encryptedWallet, password }, { token });
  },

  // Statistics and Analytics
  async getWalletStats(token?: string): Promise<{
    totalCredentials: number;
    activeCredentials: number;
    expiredCredentials: number;
    revokedCredentials: number;
    totalConnections: number;
    recentActivity: Array<{
      type: 'credential_received' | 'credential_shared' | 'connection_added';
      description: string;
      timestamp: string;
    }>;
  }> {
    return api.get('/api/wallet/stats', { token });
  }
};

export default walletService;
