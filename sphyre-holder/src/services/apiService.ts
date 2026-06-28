const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

export interface EvidenceAttachment {
  label: string;
  filename: string;
  ipfs_hash: string;
  gateway_url?: string;
  content_type?: string;
  size?: number;
}

export interface EvidenceUploadResponse {
  success: boolean;
  message?: string;
  owner_did: string;
  evidence: EvidenceAttachment;
  error?: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

class ApiService {
  private token: string | null = null;
  private userDID: string | null = null;

  constructor() {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
      this.userDID = localStorage.getItem('userDID');
    }
  }

  // Set authentication token
  setAuth(token: string, did: string) {
    this.token = token;
    this.userDID = did;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
      localStorage.setItem('userDID', did);
    }
  }

  // Clear authentication
  clearAuth() {
    this.token = null;
    this.userDID = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('userDID');
    }
  }

  // Base request method
  private async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
      };

      // Add auth header if token exists
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      // Add DID header if exists
      if (this.userDID) {
        headers['X-User-DID'] = this.userDID;
      }

      const fullUrl = `${API_BASE}${endpoint}`;
      console.log(`API Request: ${options.method || 'GET'} ${fullUrl}`);

      const response = await fetch(fullUrl, {
        ...options,
        headers,
        credentials: 'omit',
      });

      console.log(`API Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: { message?: string } = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {
          console.error('Error response (non-JSON):', errorText);
        }
        
        const errorMessage = errorData.message || errorText || `Request failed: ${response.statusText}`;
        console.error(`API Error [${response.status}]:`, errorMessage);
        
        return {
          success: false,
          error: errorMessage,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // Auth endpoints
  async login(did: string, password?: string) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ did, password }),
    });
  }

  async register(did: string, publicKey: string) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ did, public_key: publicKey }),
    });
  }

  // Wallet endpoints
  async createWallet(name?: string, email?: string) {
    return this.request('/api/wallet/create', {
      method: 'POST',
      body: JSON.stringify({ name, email }),
    });
  }

  async getWallet(did: string) {
    return this.request(`/api/wallet/${did}`);
  }

  async getCredentials(did: string) {
    return this.request(`/api/wallet/${did}/credentials`);
  }

  async getWalletActivities(did: string, limit?: number) {
    const query = typeof limit === 'number' ? `?limit=${Math.max(1, limit)}` : '';
    return this.request(`/api/wallet/${encodeURIComponent(did)}/activities${query}`);
  }

  async getPendingPresentationRequests(did: string) {
    const encodedDid = encodeURIComponent(did);
    return this.request(`/api/wallet/presentation-requests/${encodedDid}/pending`);
  }

  async getAnonymousProof(did: string, credentialId: string, attributes: string[]) {
    return this.request(`/api/wallet/${did}/credentials/${credentialId}/anonymous-proof`, {
      method: 'POST',
      body: JSON.stringify({ attributes }),
    });
  }

  async importCredential(did: string, credentialJwt: string) {
    return this.request(`/api/wallet/${did}/credentials/import`, {
      method: 'POST',
      body: JSON.stringify({ credential_jwt: credentialJwt }),
    });
  }

  async shareCredential(did: string, data: {
    credential_ids: string[];
    recipient_did: string;
    purpose: string;
  }) {
    return this.request(`/api/wallet/${did}/credentials/share`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async grantConsent(did: string, data: {
    verifier_did: string;
    purpose: string;
    data_categories: string[];
  }) {
    return this.request(`/api/wallet/${did}/consent/grant`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getConsents(did: string) {
    return this.request(`/api/wallet/${did}/consents`);
  }

  async revokeConsent(did: string, consentId: string, revokeAttributes?: string[]) {
    return this.request(`/api/wallet/${did}/consents/${consentId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ 
        holder_did: did,
        revoke_attributes: revokeAttributes
      }),
    });
  }

  async deleteConsent(did: string, consentId: string) {
    return this.request(`/api/wallet/${did}/consents/${consentId}?holder_did=${encodeURIComponent(did)}`, {
      method: 'DELETE',
    });
  }

  // QR endpoints
  async generateCredentialOfferQR(data: {
    issuer_did: string;
    credential_type: string;
    schema_id: string;
    preview: Record<string, unknown>;
  }) {
    return this.request('/api/qr/credential-offer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async generatePresentationRequestQR(data: {
    verifier_did: string;
    requested_credentials: string[];
    purpose: string;
  }) {
    return this.request('/api/qr/presentation-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async resolveQR(shortId: string) {
    return this.request(`/api/qr/resolve/${shortId}`);
  }

  // Presentation endpoints
  async createPresentation(data: {
    prover_did: string;
    verifier_did: string;
    credential_ids: string[];
    presentation_type: string;
  }) {
    return this.request('/api/wallet/presentation', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPresentations(did: string) {
    return this.request(`/api/wallet/${did}/presentations`);
  }

  // Credential Request endpoints
  async submitCredentialRequest(data: {
    user_did: string;
    issuer_did: string;
    template_id: string;
    schema_id: string;
    credential_type: string;
    request_data: Record<string, string>;
    timestamp: string;
    evidence?: EvidenceAttachment[];
  }) {
    return this.request('/api/wallet/credential-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadEvidence(did: string, file: File, label?: string) {
    try {
      const formData = new FormData();
      if (label) {
        formData.append('label', label);
      }
      formData.append('file', file);

      const headers: HeadersInit = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      if (this.userDID) {
        headers['X-User-DID'] = this.userDID;
      }

      const response = await fetch(
        `${API_BASE}/api/wallet/${encodeURIComponent(did)}/evidence/upload`,
        {
          method: 'POST',
          headers,
          body: formData,
        }
      );

      const json: EvidenceUploadResponse = await response.json();

      if (!response.ok || !json.success) {
        return {
          success: false,
          error: json.error || json.message || 'Failed to upload evidence',
        } as ApiResponse<EvidenceUploadResponse>;
      }

      return {
        success: true,
        data: json,
      } as ApiResponse<EvidenceUploadResponse>;
    } catch (error) {
      console.error('Evidence upload failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload evidence',
      } as ApiResponse<EvidenceUploadResponse>;
    }
  }

  async getCredentialRequests(did: string) {
    return this.request(`/api/wallet/${did}/credential-requests`);
  }

  async getCredentialRequestStatus(did: string, requestId: string) {
    return this.request(`/api/wallet/${did}/credential-request/${requestId}`);
  }

  async getTemplatesBySchema(schemaId?: string) {
    const query = schemaId ? `?schema_id=${schemaId}` : '';
    return this.request(`/api/issuer/templates${query}`);
  }
  
  async getAllTemplates() {
    return this.request('/api/issuer/templates');
  }

  async getTemplate(templateId: string) {
    return this.request(`/api/issuer/templates/${templateId}`);
  }

  async getTemplateByIssuer(issuerDid: string, templateId: string) {
    const encodedDid = encodeURIComponent(issuerDid);
    return this.request(`/api/issuer/${encodedDid}/templates/${templateId}`);
  }

  async verifyCredentialFromIPFS(ipfsHash: string) {
    return this.request(`/api/verifier/verify/ipfs/${ipfsHash}`);
  }

  async submitPresentation(data: {
    request_id: string;
    holder_did: string;
    credentials: unknown[];
    zk_proofs?: unknown[];
    consent_id?: string;
    consent_expires_at?: string;
  }) {
    return this.request('/api/verifier/presentations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async acceptCredentialOffer(data: {
    offer_id: string;
    holder_did: string;
  }) {
    console.warn('acceptCredentialOffer is deprecated. Use importCredential instead.');
    return {
      success: false,
      error: 'This endpoint is not implemented. Use importCredential with credential_jwt.'
    };
  }

  // Get verifier info
  async getVerifierInfo(verifierDid: string) {
    const didEnc = encodeURIComponent(verifierDid);
    return this.request(`/api/verifier/${didEnc}/info`);
  }

  // Get issuer info
  async getIssuerInfo(issuerDid: string) {
    return this.request(`/api/issuer/${issuerDid}`);
  }

  async getOfferChallenge(offerId: string) {
    return this.request(`/api/wallet/offers/${offerId}/challenge`);
  }

  // Accept offer with proof and holder data
  async acceptOffer(offerId: string, data: {
    holder_did: string;
    proof: {
      type: string;
      nonce: string;
      signature: string;
      did?: string;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    holder_data?: Record<string, any>;
    evidence?: EvidenceAttachment[];
    metadata?: Record<string, unknown>;
  }) {
    return this.request(`/api/wallet/offers/${offerId}/accept`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Issue credential (from issuer)
  async issueCredential(issuerDid: string, data: {
    credential_type: string;
    schema_id: string;
    subject_did: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attributes: Record<string, any>;
    expiration_date?: string;
  }) {
    return this.request(`/api/issuer/${issuerDid}/issue`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async revokeCredential(holderDid: string, credentialId: string) {
    return this.request(`/api/wallet/${holderDid}/credentials/${credentialId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({
        holder_did: holderDid,
      }),
    });
  }

  async checkHealth() {
    return this.request('/health');
  }
}

// Export singleton instance
const apiService = new ApiService();
export default apiService;
