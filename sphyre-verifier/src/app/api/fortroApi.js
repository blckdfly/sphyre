'use client';

// API base URL - use environment variable or fallback
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'http://fortro-engine:3000'
    : 'http://localhost:8000');

// Helper function for making API requests
async function fetchApi(endpoint, method = 'GET', data = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'An error occurred');
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Authentication functions
export const authApi = {
  register: (data) => fetchApi('/auth/register', 'POST', data),
  login: (data) => fetchApi('/auth/login', 'POST', data),
  generateDid: (token, method = 'key') => fetchApi('/auth/generate-did', 'POST', { method }, token),
};

// Verifier functions
export const verifierApi = {
  // Create a presentation request
  createPresentationRequest: (token, data) => 
    fetchApi('/verifier/presentations/request', 'POST', data, token),
  
  // Verify a presentation
  verifyPresentation: (token, data) => 
    fetchApi('/verifier/presentations/verify', 'POST', data, token),
  
  // Get all presentation requests
  getPresentationRequests: (token) => 
    fetchApi('/verifier/presentations/requests', 'GET', null, token),
  
  // Get presentation request by ID
  getPresentationRequest: (token, requestId) => 
    fetchApi(`/verifier/presentations/requests/${requestId}`, 'GET', null, token),
  
  // Get verification results
  getVerificationResults: (token) => 
    fetchApi('/verifier/presentations/results', 'GET', null, token),
  
  // Get verification result by ID
  getVerificationResult: (token, resultId) => 
    fetchApi(`/verifier/presentations/results/${resultId}`, 'GET', null, token),
};

// Health check function
export const checkApiHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (response.ok) {
      const data = await response.json();
      return { isHealthy: true, data };
    }
    return { isHealthy: false, error: 'API is not healthy' };
  } catch (error) {
    return { isHealthy: false, error: 'Failed to connect to API' };
  }
};

// Export all APIs
export default {
  auth: authApi,
  verifier: verifierApi,
  checkHealth: checkApiHealth,
};