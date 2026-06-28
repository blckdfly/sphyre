const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.sphyre.tech';

function encodeDID(did) {
  if (!did) return did;
  return encodeURIComponent(did);
}

async function fetchApi(endpoint, method = 'GET', data = null, token = null, issuerDid = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (issuerDid) {
    headers['X-Issuer-DID'] = issuerDid;
  }

  const config = {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'omit',
  };

  try {
    console.log(`[API Request] ${method} ${endpoint}`, { data, headers: { ...headers, Authorization: token ? 'Bearer ***' : undefined } });
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (!response.ok) {
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        try {
          const text = await response.text();
          console.error(`[API Response Text] ${method} ${endpoint}:`, text);
        } catch (e2) {
        }
      }
      
      let errorMessage = errorData.message || errorData.error || `Request failed: ${response.statusText}`;
      
      if (typeof errorMessage === 'object') {
        errorMessage = JSON.stringify(errorMessage);
      }
      
      console.error(`[API Error] ${method} ${endpoint} (${response.status}):`, {
        statusCode: response.status,
        statusText: response.statusText,
        message: errorMessage,
        fullError: errorData,
        fullResponse: JSON.stringify(errorData, null, 2)
      });
      throw new Error(`${response.status}: ${errorMessage}`);
    }

    const result = await response.json();
    console.log(`[API Success] ${method} ${endpoint} (${response.status}):`, result);
    
    if (result.success !== undefined) {
      return result.data || result.schemas || result.templates || result.credentials || result.schema || result.template || result;
    }
    return result;
  } catch (error) {
    console.error(`[API Failed] ${method} ${endpoint}:`, error);
    throw error;
  }
}

export const issuerApi = {
  createSchema: async (token, issuerDid, data) => {
    try {
      console.log('Creating schema with data:', data);
      
      const requestData = {
        name: data.name,
        version: data.version || '1.0.0',
        description: data.description || '',
        attributes: data.attributes.map(attr => {
          if (typeof attr === 'string') {
            return {
              name: attr,
              data_type: 'string',
              description: '',
              required: true
            };
          }
          // If attr is already an object, use its properties
          return {
            name: attr.name,
            data_type: attr.data_type || attr.type || 'string',
            description: attr.description || '',
            required: attr.required !== false
          };
        }),
        extensions_allowed: data.extensionsAllowed || false,
        allowed_extensions: data.allowedExtensions 
          ? (Array.isArray(data.allowedExtensions) 
              ? data.allowedExtensions 
              : data.allowedExtensions.split(',').map(s => s.trim()))
          : [],
        evidence_allowed: data.evidenceAllowed || false,
        allowed_evidence: data.allowedEvidence 
          ? (Array.isArray(data.allowedEvidence)
              ? data.allowedEvidence
              : data.allowedEvidence.split(',').map(s => s.trim()))
          : []
      };

      console.log('Sending schema data:', JSON.stringify(requestData, null, 2)); 
      
      const response = await fetchApi(
        `/api/issuer/${encodeDID(issuerDid)}/schemas`,
        'POST',
        requestData,
        token,
        issuerDid
      );

      console.log('Schema created successfully:', response); 
      return { success: true, data: response };
    } catch (error) {
      console.error('Error creating schema:', {
        error: error.message,
        response: error.response?.data
      });
      return { 
        success: false, 
        error: error.message || 'Failed to create schema. Please check the console for details.' 
      };
    }
  },
  listSchemas: (token, issuerDid) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/schemas`, 'GET', null, token, issuerDid),
  getSchema: (token, issuerDid, schemaId) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/schemas/${schemaId}`, 'GET', null, token, issuerDid),
  updateSchema: async (token, issuerDid, schemaId, data) => {
    const requestData = {
      name: data.name,
      version: data.version || '1.0.0',
      description: data.description || '',
      attributes: (data.attributes || []).map(attr => {
        if (typeof attr === 'string') {
          return {
            name: attr,
            data_type: 'string',
            description: '',
            required: true,
          };
        }
        return {
          name: attr.name,
          data_type: attr.data_type || attr.type || 'string',
          description: attr.description || '',
          required: attr.required !== false,
        };
      }),
      extensions_allowed: data.extensionsAllowed || false,
      allowed_extensions: data.allowedExtensions
        ? (Array.isArray(data.allowedExtensions)
            ? data.allowedExtensions
            : data.allowedExtensions.split(',').map(s => s.trim()))
        : [],
      evidence_allowed: data.evidenceAllowed || false,
      allowed_evidence: data.allowedEvidence
        ? (Array.isArray(data.allowedEvidence)
            ? data.allowedEvidence
            : data.allowedEvidence.split(',').map(s => s.trim()))
        : [],
    };

    return fetchApi(
      `/api/issuer/${encodeDID(issuerDid)}/schemas/${schemaId}`,
      'PUT',
      requestData,
      token,
      issuerDid
    );
  },
  deleteSchema: (token, issuerDid, schemaId) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/schemas/${schemaId}`, 'DELETE', null, token, issuerDid),
  
  // Credential templates
  createTemplate: (token, issuerDid, data) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/templates`, 'POST', data, token, issuerDid),
  getTemplate: (token, issuerDid, templateId) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/templates/${templateId}`, 'GET', null, token, issuerDid),
  updateTemplate: (token, issuerDid, templateId, data) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/templates/${templateId}`, 'PUT', data, token, issuerDid),
  deleteTemplate: (token, issuerDid, templateId) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/templates/${templateId}`, 'DELETE', null, token, issuerDid),
  
  // Credential issuance - with timeout to prevent hanging
  issueCredential: async (token, issuerDid, data) => {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Credential issuance timed out after 30 seconds. Backend may be unreachable or IPFS upload is failing.')), 30000)
    );
    
    try {
      return await Promise.race([
        fetchApi(`/api/issuer/${encodeDID(issuerDid)}/issue`, 'POST', data, token, issuerDid),
        timeoutPromise
      ]);
    } catch (error) {
      console.error('[issueCredential] Error:', error);
      throw error;
    }
  },
  uploadEvidence: async (token, holderDid, file, label) => {
    if (!holderDid) {
      throw new Error('Holder DID is required to upload evidence');
    }
    if (!file) {
      throw new Error('Evidence file is required');
    }

    const formData = new FormData();
    formData.append('file', file);
    if (label && label.trim()) {
      formData.append('label', label.trim());
    }

    const headers = token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {};

    const response = await fetch(
      `${API_BASE_URL}/api/wallet/${encodeDID(holderDid)}/evidence/upload`,
      {
        method: 'POST',
        headers,
        body: formData,
      }
    );

    let json;
    try {
      json = await response.json();
    } catch (err) {
      console.error('[uploadEvidence] Failed to parse response JSON', err);
      throw new Error('Failed to upload evidence');
    }

    if (!response.ok || json.success === false) {
      const message =
        json?.error ||
        json?.message ||
        `Evidence upload failed with status ${response.status}`;
      throw new Error(message);
    }

    return json;
  },

  createOffer: async (token, issuerDid, data) => {
    try {
      console.log('[createOffer] Creating offer:', { issuerDid, data });
      return await fetchApi(
        `/api/issuer/${encodeDID(issuerDid)}/offers`,
        'POST',
        {
          ...data,
          evidence_required: data.evidence_required || [],
          allowed_evidence: data.allowed_evidence || [],
        },
        token,
        issuerDid
      );
    } catch (error) {
      console.error('[createOffer] Error:', error);
      throw error;
    }
  },
  
  generateOfferQR: async (token, issuerDid, offerId) => {
    try {
      console.log('Generating QR for offer:', { issuerDid, offerId });
      return await fetchApi(
        `/api/issuer/${encodeDID(issuerDid)}/offers/${offerId}/qr`,
        'GET',
        null,
        token,
        issuerDid
      );
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  },
  listIssuedCredentials: (token, issuerDid) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/credentials`, 'GET', null, token),
  listOffers: (token, issuerDid) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/offers`, 'GET', null, token),
  getCredential: (token, credentialId) => 
    fetchApi(`/api/credentials/${credentialId}`, 'GET', null, token),
  revokeCredential: (token, issuerDid, credentialId) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/credentials/${credentialId}/revoke`, 'POST', null, token),
  
  getCredentialRequests: (token, issuerDid) => 
    fetchApi(`/api/wallet/issuer/${encodeDID(issuerDid)}/requests`, 'GET', null, token, issuerDid),
  getCredentialRequest: (token, issuerDid, requestId) =>
    fetchApi(`/api/wallet/issuer/${encodeDID(issuerDid)}/request/${requestId}`, 'GET', null, token, issuerDid),
  getRequestChallenge: (token, issuerDid, requestId) =>
    fetchApi(`/api/wallet/issuer/${encodeDID(issuerDid)}/request/${requestId}/challenge`, 'GET', null, token, issuerDid),
  approveCredentialRequest: (token, issuerDid, requestId, data) => {
    const payload = {
      proof: data.proof,
      issuer_data: data.issuer_data || {},
      ...(Array.isArray(data.evidence) && data.evidence.length > 0
        ? {
            evidence: data.evidence.map((att) => ({
              label: att.label,
              filename: att.filename,
              ipfs_hash: att.ipfs_hash,
              gateway_url: att.gateway_url,
              content_type: att.content_type,
              size: att.size,
            })),
          }
        : {}),
      ...(data.reason && { reason: data.reason })
    };
    return fetchApi(`/api/wallet/issuer/${encodeDID(issuerDid)}/request/${requestId}/approve`, 'POST', payload, token, issuerDid);
  },
  rejectCredentialRequest: (token, issuerDid, requestId, data) => 
    fetchApi(`/api/wallet/issuer/${encodeDID(issuerDid)}/request/${requestId}/reject`, 'POST', data, token, issuerDid),
  
  listTemplates: (token, issuerDid) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/templates`, 'GET', null, token, issuerDid),
  
  getIssuerInfo: (issuerDid) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}`, 'GET'),
  updateIssuerInfo: (token, issuerDid, data) => 
    fetchApi(`/api/issuer/${encodeDID(issuerDid)}/update`, 'PUT', data, token, issuerDid),
  
  uploadProfilePhoto: async (token, issuerDid, formData) => {
    const response = await fetch(`${API_BASE_URL}/api/issuer/${encodeDID(issuerDid)}/upload-photo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    return response.json();
  },
  uploadLogo: async (token, issuerDid, formData) => {
    const response = await fetch(`${API_BASE_URL}/api/issuer/${encodeDID(issuerDid)}/upload-logo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    return response.json();
  },
};

// QR Code functions
export const qrApi = {
  generateCredentialOffer: (token, issuerDid, data) => 
    fetchApi('/api/qr/credential-offer', 'POST', { ...data, issuer_did: issuerDid }, token),
  generatePresentationRequest: (token, verifierDid, data) => 
    fetchApi('/api/qr/presentation-request', 'POST', { ...data, verifier_did: verifierDid }, token),
};

// Health check function
export const checkApiHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    if (response.ok) {
      return { status: 'ok' };
    }
    return { status: 'error', message: 'API is not responding' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
};

export default {
  issuer: issuerApi,
  qr: qrApi,
  checkApiHealth,
};