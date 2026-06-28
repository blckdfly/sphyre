// Base API configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.sphyre.tech';

// API endpoints
export const API_ENDPOINTS = {
  // Auth endpoints
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    ME: '/api/auth/me',
    REGISTER: '/api/auth/register',
  },
  
  // Issuer endpoints
  ISSUERS: {
    BASE: '/api/issuer',
    SCHEMAS: (did: string) => `/api/issuer/${did}/schemas`,
    TEMPLATES: (did: string) => `/api/issuer/${did}/templates`,
    CREDENTIALS: (did: string) => `/api/issuer/${did}/credentials`,
    REQUESTS: (did: string) => `/api/issuer/${did}/requests`,
    STATISTICS: (did: string) => `/api/issuer/${did}/statistics`,
  },
  
  // Verifier endpoints
  VERIFIERS: {
    REQUESTS: '/api/verifier/requests',
    PRESENTATIONS: '/api/verifier/presentations',
    CONSENTS: '/api/verifier/consents',
    CHECK_CONSENT: '/api/verifier/consents/check',
    REQUEST_CONSENT: '/api/verifier/consents/request',
    QR: '/api/qr/presentation-request',
    STATISTICS: (did: string) => `/api/verifier/${did}/statistics`,
  },
  
  // Wallet endpoints
  WALLET: {
    CREDENTIALS: '/api/wallet/credentials',
    PRESENTATIONS: '/api/wallet/presentations',
    CONNECTIONS: '/api/wallet/connections',
  },
  
  // QR Code endpoints
  QR: {
    PROCESS: '/api/wallet/qr/process',
    CREDENTIAL_OFFER: '/api/qr/credential-offer',
    PRESENTATION_REQUEST: '/api/qr/presentation-request',
  },
};

// Default headers for API requests
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// Helper to get auth headers
export const getAuthHeaders = (token?: string) => {
  if (!token && typeof window !== 'undefined') {
    // In a real app, you'd get this from your auth context or storage
    token = localStorage.getItem('auth_token') || '';
  }
  
  return {
    ...DEFAULT_HEADERS,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};
