// API base URL - use environment variable or fallback
const API_BASE_URL = process.env.REACT_APP_API_URL || 
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

// Issuer functions
export const issuerApi = {
  // Issue a credential
  issueCredential: (token, data) => 
    fetchApi('/issuer/credentials/issue', 'POST', data, token),
  
  // Create a credential offer
  createCredentialOffer: (token, data) => 
    fetchApi('/issuer/credentials/offer', 'POST', data, token),
  
  // Get issued credentials
  getIssuedCredentials: (token) => 
    fetchApi('/issuer/credentials', 'GET', null, token),
  
  // Get credential by ID
  getCredential: (token, credentialId) => 
    fetchApi(`/issuer/credentials/${credentialId}`, 'GET', null, token),
  
  // Revoke a credential
  revokeCredential: (token, credentialId) => 
    fetchApi(`/issuer/credentials/${credentialId}/revoke`, 'POST', null, token),
};

// Schema functions
export const schemaApi = {
  // Create a credential schema
  createSchema: (token, data) => 
    fetchApi('/schemas', 'POST', data, token),
  
  // Get all schemas
  getSchemas: (token) => 
    fetchApi('/schemas', 'GET', null, token),
  
  // Get schema by ID
  getSchema: (token, schemaId) => 
    fetchApi(`/schemas/${schemaId}`, 'GET', null, token),
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
  issuer: issuerApi,
  schema: schemaApi,
  checkHealth: checkApiHealth,
};