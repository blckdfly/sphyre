import { api } from '../client';
import { API_ENDPOINTS } from '../config';

export interface PresentationRequest {
  id: string;
  verifierDid: string;
  name: string;
  description?: string;
  requestedAttributes: {
    [key: string]: {
      name: string;
      required: boolean;
      condition?: {
        type: 'equals' | 'greaterThan' | 'lessThan' | 'includes';
        value: unknown;
      };
    };
  };
  expiresAt?: string;
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
  updatedAt: string;
}

export interface Presentation {
  id: string;
  requestId: string;
  holderDid: string;
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  verifiedAt?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Consent {
  id: string;
  verifierDid: string;
  holderDid: string;
  scope: string[];
  expiresAt?: string;
  status: 'active' | 'revoked' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export const verifierService = {
  // Presentation Requests
  async createPresentationRequest(
    data: Omit<PresentationRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
    token?: string
  ): Promise<PresentationRequest> {
    return api.post<PresentationRequest>(API_ENDPOINTS.VERIFIERS.REQUESTS, data, { token });
  },

  async getPresentationRequest(requestId: string, token?: string): Promise<PresentationRequest> {
    return api.get<PresentationRequest>(`${API_ENDPOINTS.VERIFIERS.REQUESTS}/${requestId}`, { token });
  },

  // Presentations
  async listPresentations(params?: {
    requestId?: string;
    holderDid?: string;
    status?: string;
    page?: number;
    limit?: number;
  }, token?: string): Promise<{ items: Presentation[]; total: number }> {
    return api.get<{ items: Presentation[]; total: number }>(
      API_ENDPOINTS.VERIFIERS.PRESENTATIONS, 
      { params, token }
    );
  },

  async getPresentation(presentationId: string, token?: string): Promise<Presentation> {
    return api.get<Presentation>(`${API_ENDPOINTS.VERIFIERS.PRESENTATIONS}/${presentationId}`, { token });
  },

  async verifyPresentation(presentationId: string, token?: string): Promise<{ valid: boolean; message?: string }> {
    return api.post<{ valid: boolean; message?: string }>(
      `${API_ENDPOINTS.VERIFIERS.PRESENTATIONS}/${presentationId}/verify`,
      {},
      { token }
    );
  },

  async updatePresentationStatus(
    presentationId: string, 
    status: 'verified' | 'rejected', 
    reason?: string,
    token?: string
  ): Promise<Presentation> {
    return api.put<Presentation>(
      `${API_ENDPOINTS.VERIFIERS.PRESENTATIONS}/${presentationId}/status`,
      { status, reason },
      { token }
    );
  },

  // Consent Management
  async listConsents(params?: {
    verifierDid?: string;
    holderDid?: string;
    status?: string;
    page?: number;
    limit?: number;
  }, token?: string): Promise<{ items: Consent[]; total: number }> {
    return api.get<{ items: Consent[]; total: number }>(
      API_ENDPOINTS.VERIFIERS.CONSENTS,
      { params, token }
    );
  },

  async requestConsent(
    data: {
      verifierDid: string;
      holderDid: string;
      scope: string[];
      purpose: string;
      expiresInDays?: number;
    },
    token?: string
  ): Promise<{ consent: Consent; requiresUserApproval: boolean }> {
    return api.post<{ consent: Consent; requiresUserApproval: boolean }>(
      API_ENDPOINTS.VERIFIERS.REQUEST_CONSENT,
      data,
      { token }
    );
  },

  async checkConsent(
    data: {
      verifierDid: string;
      holderDid: string;
      scope: string[];
    },
    token?: string
  ): Promise<{ hasConsent: boolean; consent?: Consent }> {
    return api.post<{ hasConsent: boolean; consent?: Consent }>(
      API_ENDPOINTS.VERIFIERS.CHECK_CONSENT,
      data,
      { token }
    );
  },

  // QR Code Generation
  async generatePresentationRequestQr(
    data: {
      requestId: string;
      callbackUrl?: string;
      expiresInHours?: number;
    },
    token?: string
  ): Promise<{ qrCode: string; deepLink: string; expiresAt: string }> {
    return api.post<{ qrCode: string; deepLink: string; expiresAt: string }>(
      API_ENDPOINTS.VERIFIERS.QR,
      data,
      { token }
    );
  },

  // Statistics
  async getVerifierStatistics(did: string, token?: string) {
    return api.get(API_ENDPOINTS.VERIFIERS.STATISTICS(did), { token });
  },
};

export default verifierService;
