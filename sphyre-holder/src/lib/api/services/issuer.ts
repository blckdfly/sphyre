import { api } from '../client';
import { API_ENDPOINTS } from '../config';

export interface Issuer {
  did: string;
  name: string;
  description?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Schema {
  id: string;
  name: string;
  version: string;
  attributes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CredentialTemplate {
  id: string;
  name: string;
  schemaId: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IssueCredentialRequest {
  templateId: string;
  holderDid: string;
  credentialData: Record<string, unknown>;
  expirationDate?: string;
}

export interface CredentialQueryParams {
    status?: string;
    holderDid?: string;
    templateId?: string;
    limit?: number;
    offset?: number;
    [key: string]: string | number | boolean | undefined;
}

export const issuerService = {
  // Issuer Management
  async createIssuer(data: Omit<Issuer, 'did' | 'createdAt' | 'updatedAt'>, token?: string): Promise<Issuer> {
    return api.post<Issuer>(API_ENDPOINTS.ISSUERS.BASE, data, { token });
  },

  async getIssuer(did: string, token?: string): Promise<Issuer> {
    return api.get<Issuer>(`${API_ENDPOINTS.ISSUERS.BASE}/${did}`, { token });
  },

  async updateIssuer(did: string, data: Partial<Issuer>, token?: string): Promise<Issuer> {
    return api.put<Issuer>(`${API_ENDPOINTS.ISSUERS.BASE}/${did}`, data, { token });
  },

  // Schema Management
  async createSchema(did: string, data: Omit<Schema, 'id' | 'createdAt' | 'updatedAt'>, token?: string): Promise<Schema> {
    return api.post<Schema>(API_ENDPOINTS.ISSUERS.SCHEMAS(did), data, { token });
  },

  async listSchemas(did: string, token?: string): Promise<Schema[]> {
    return api.get<Schema[]>(API_ENDPOINTS.ISSUERS.SCHEMAS(did), { token });
  },

  async getSchema(did: string, schemaId: string, token?: string): Promise<Schema> {
    return api.get<Schema>(`${API_ENDPOINTS.ISSUERS.SCHEMAS(did)}/${schemaId}`, { token });
  },

  async updateSchema(
    did: string, 
    schemaId: string, 
    data: Partial<Omit<Schema, 'id' | 'createdAt' | 'updatedAt'>>,
    token?: string
  ): Promise<Schema> {
    return api.put<Schema>(`${API_ENDPOINTS.ISSUERS.SCHEMAS(did)}/${schemaId}`, data, { token });
  },

  async deleteSchema(did: string, schemaId: string, token?: string): Promise<void> {
    await api.delete<void>(`${API_ENDPOINTS.ISSUERS.SCHEMAS(did)}/${schemaId}`, { token });
  },

  // Credential Templates
  async createCredentialTemplate(
    did: string, 
    data: Omit<CredentialTemplate, 'id' | 'createdAt' | 'updatedAt'>,
    token?: string
  ): Promise<CredentialTemplate> {
    return api.post<CredentialTemplate>(API_ENDPOINTS.ISSUERS.TEMPLATES(did), data, { token });
  },

  async listCredentialTemplates(did: string, token?: string): Promise<CredentialTemplate[]> {
    return api.get<CredentialTemplate[]>(API_ENDPOINTS.ISSUERS.TEMPLATES(did), { token });
  },

  async getCredentialTemplate(did: string, templateId: string, token?: string): Promise<CredentialTemplate> {
    return api.get<CredentialTemplate>(`${API_ENDPOINTS.ISSUERS.TEMPLATES(did)}/${templateId}`, { token });
  },

  async updateCredentialTemplate(
    did: string, 
    templateId: string, 
    data: Partial<Omit<CredentialTemplate, 'id' | 'createdAt' | 'updatedAt'>>,
    token?: string
  ): Promise<CredentialTemplate> {
    return api.put<CredentialTemplate>(
      `${API_ENDPOINTS.ISSUERS.TEMPLATES(did)}/${templateId}`, 
      data, 
      { token }
    );
  },

  async deleteCredentialTemplate(did: string, templateId: string, token?: string): Promise<void> {
    await api.delete<void>(`${API_ENDPOINTS.ISSUERS.TEMPLATES(did)}/${templateId}`, { token });
  },

  // Credential Issuance
  async issueCredential(did: string, data: IssueCredentialRequest, token?: string) {
    return api.post(`${API_ENDPOINTS.ISSUERS.CREDENTIALS(did)}/issue`, data, { token });
  },

    async listIssuedCredentials(did: string, params?: CredentialQueryParams, token?: string) {
        return api.get(`${API_ENDPOINTS.ISSUERS.CREDENTIALS(did)}`, { params, token });
    },

  async getIssuedCredential(did: string, credentialId: string, token?: string) {
    return api.get(`${API_ENDPOINTS.ISSUERS.CREDENTIALS(did)}/${credentialId}`, { token });
  },

  async revokeCredential(did: string, credentialId: string, token?: string) {
    return api.post(`${API_ENDPOINTS.ISSUERS.CREDENTIALS(did)}/${credentialId}/revoke`, {}, { token });
  },

  // Credential Requests
  async listCredentialRequests(did: string, params?: Record<string, string | number | boolean>, token?: string) {
    return api.get(API_ENDPOINTS.ISSUERS.REQUESTS(did), { params, token });
  },

  async getCredentialRequest(did: string, requestId: string, token?: string) {
    return api.get(`${API_ENDPOINTS.ISSUERS.REQUESTS(did)}/${requestId}`, { token });
  },

  async approveCredentialRequest(did: string, requestId: string, token?: string) {
    return api.post(`${API_ENDPOINTS.ISSUERS.REQUESTS(did)}/${requestId}/approve`, {}, { token });
  },

  async rejectCredentialRequest(did: string, requestId: string, reason?: string, token?: string) {
    return api.post(
      `${API_ENDPOINTS.ISSUERS.REQUESTS(did)}/${requestId}/reject`, 
      reason ? { reason } : {},
      { token }
    );
  },

  // QR Code Generation
  async generateCredentialOfferQr(did: string, data: {
    templateId: string;
    credentialData?: Record<string, unknown>;
    expirationDate?: string;
  }, token?: string) {
    return api.post(`${API_ENDPOINTS.ISSUERS.BASE}/${did}/qr/offer`, data, { token });
  },

  // Statistics
  async getIssuerStatistics(did: string, token?: string) {
    return api.get(API_ENDPOINTS.ISSUERS.STATISTICS(did), { token });
  },
};

export default issuerService;
