const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

function encodeDID(did: string): string {
  if (!did) return did;
  return encodeURIComponent(did);
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

class ApiService {
  private token: string | null = null;
  private verifierDID: string | null = null;

  constructor() {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('verifier_token');
      this.verifierDID = localStorage.getItem('verifier_did');
    }
  }

  setAuth(token: string, did: string) {
    this.token = token;
    this.verifierDID = did;
    if (typeof window !== 'undefined') {
      localStorage.setItem('verifier_token', token);
      localStorage.setItem('verifier_did', did);
    }
  }

  // Clear authentication 
  clearAuth() {
    this.token = null;
    this.verifierDID = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('verifier_token');
      localStorage.removeItem('verifier_did');
    }
  }

  private async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add auth header if token exists
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      // Add DID header if exists
      if (this.verifierDID) {
        headers['X-Verifier-DID'] = this.verifierDID;
      }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'omit', 
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.message || `Request failed: ${response.statusText}`,
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

  async createPresentationRequest(data: {
    verifier_did: string;
    requested_credentials: string[];
    purpose: string;
  }) {
    return this.request('/api/verifier/presentation-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyPresentation(data: {
    presentation_jwt: string;
    verifier_did: string;
  }) {
    return this.request('/api/verifier/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getVerificationSessions(verifierDid: string) {
    return this.request(`/api/verifier/${verifierDid}/sessions`);
  }

  async getVerificationSession(verifierDid: string, sessionId: string) {
    return this.request(`/api/verifier/${verifierDid}/session/${sessionId}`);
  }

  // QR endpoints
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

  // Generate presentation request QR with backend validation
  async generatePresentationRequestQRWithBackend(data: {
    verifier_did: string;
    required_credentials: Array<{
      credential_type: string;
      required_attributes: string[];
      issuer_did?: string | null;
      predicate?: {
        attribute: string;
        predicate_type: string;
        value: number | string;
      } | null;
    }>;
    presentation_type: string;
    purpose: string;
    callback_url?: string;
    expires_at?: string;
    required_attribute_values?: Record<string, string[]>;
  }) {
    return this.request('/api/verifier/qr/presentation-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async resolveQR(shortId: string) {
    return this.request(`/api/qr/resolve/${shortId}`);
  }

  // Consent management
  async getConsents(verifierDid: string) {
    return this.request(`/api/verifier/${verifierDid}/consents`);
  }

  async requestConsent(data: {
    verifier_did: string;
    user_did: string;
    purpose: string;
    data_categories: string[];
  }) {
    return this.request('/api/verifier/consent/request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listPresets(verifierDid: string) {
    return this.request(`/api/verifier/${encodeDID(verifierDid)}/presets`);
  }

  // Get single preset
  async getPreset(verifierDid: string, presetId: string) {
    return this.request(`/api/verifier/${encodeDID(verifierDid)}/presets/${presetId}`);
  }

  // Create new preset
  async createPreset(verifierDid: string, data: {
    name: string;
    description: string;
    preset_type: string;
    required_predicates?: Array<{
      attribute: string;
      operator: string;
      value: number;
      predicate_type: string;
    }>;
    required_attributes: string[];
    requested_attributes?: string[];
  }) {
    return this.request(`/api/verifier/${encodeDID(verifierDid)}/presets`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Update existing preset
  async updatePreset(verifierDid: string, presetId: string, data: {
    name?: string;
    description?: string;
    preset_type?: string;
    required_predicates?: Array<{
      attribute: string;
      operator: string;
      value: number;
      predicate_type: string;
    }>;
    required_attributes?: string[];
    requested_attributes?: string[];
  }) {
    return this.request(`/api/verifier/${encodeDID(verifierDid)}/presets/${encodeURIComponent(presetId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Delete preset
  async deletePreset(verifierDid: string, presetId: string) {
    return this.request(`/api/verifier/${encodeDID(verifierDid)}/presets/${presetId}`, {
      method: 'DELETE',
    });
  }

  // Verifier profile management
  async getVerifierInfo(verifierDid: string) {
    return this.request(`/api/verifier/${verifierDid}/info`);
  }

  async updateVerifierInfo(verifierDid: string, data: {
    name?: string;
    organization?: string;
    description?: string;
    website?: string;
  }) {
    return this.request(`/api/verifier/${verifierDid}/update`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Health check
  async checkHealth() {
    return this.request('/health');
  }
}

// Export singleton instance
const apiService = new ApiService();
export default apiService;
