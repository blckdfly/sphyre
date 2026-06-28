const API_BASE = process.env.REACT_APP_API_URL || 'https://api.sphyre.tech';

class IssuerMetaTxService {
  getAuthHeaders() {
    const issuerDID = localStorage.getItem('issuerDID');
    const authToken = localStorage.getItem('authToken');
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    } else if (issuerDID) {
      headers['X-Issuer-DID'] = issuerDID;
    }
    
    return headers;
  }

  async registerCredentialViaRelayer(did, credentialHash, metadataUri) {
    try {
      console.log('Sending credential to backend for blockchain registration...');
      
      const response = await fetch(`${API_BASE}/api/blockchain/register-credential-relayer`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          did,
          credentialHash,
          metadataUri,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || 'Failed to register credential');
      }

      const result = await response.json();
      console.log('Credential registered by backend relayer!');
      
      return {
        success: true,
        tx_hash: result.txHash || result.tx_hash,
        message: result.message,
      };
    } catch (error) {
      console.error('Relayer registration error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async registerCredential(issuerAddress, did, credentialHash, metadataUri) {
    return await this.registerCredentialViaRelayer(did, credentialHash, metadataUri);
  }

  async registerSchema(issuerAddress, schemaId, schemaUri) {
    try {
      const response = await fetch(`${API_BASE}/api/blockchain/register-schema-relayer`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          schemaId,
          schemaUri,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || 'Failed to register schema');
      }

      const result = await response.json();
      return {
        success: true,
        tx_hash: result.txHash || result.tx_hash,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async revokeCredential(issuerAddress, did, credentialHash) {
    try {
      const response = await fetch(`${API_BASE}/api/blockchain/revoke-credential-relayer`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          did,
          credentialHash,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || 'Failed to revoke credential');
      }

      const result = await response.json();
      return {
        success: true,
        tx_hash: result.txHash || result.tx_hash,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async isMetaTxEnabled() {
    try {
      const response = await fetch(`${API_BASE}/api/blockchain/status`);
      const status = await response.json();
      return status.metaTransactionsEnabled === true && status.forwarderAddress;
    } catch (error) {
      console.error('Failed to check meta-tx status:', error);
      return false;
    }
  }

  async getBlockchainStatus() {
    const response = await fetch(`${API_BASE}/api/blockchain/status`);
    
    if (!response.ok) {
      throw new Error('Failed to get blockchain status');
    }
    
    return await response.json();
  }
}

const issuerMetaTxService = new IssuerMetaTxService();
export default issuerMetaTxService;