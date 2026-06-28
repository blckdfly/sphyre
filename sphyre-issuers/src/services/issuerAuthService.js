import { generateSeedPhrase, validateSeedPhrase, deriveAuthToken, encryptData, decryptData, validatePIN } from '../utils/crypto';

const API_BASE = process.env.REACT_APP_API_URL || 'https://api.sphyre.tech';

class IssuerAuthService {
  constructor() {
    this.STORAGE_KEY = 'issuer_auth';
    this.SESSION_KEY = 'issuer_session_authenticated';
  }

  isLoggedIn() {
    const data = this.getAuthData();
    return !!data && !!data.did;
  }

  isSessionAuthenticated() {
    return sessionStorage.getItem(this.SESSION_KEY) === 'true';
  }

  setSessionAuthenticated(value) {
    if (value) {
      sessionStorage.setItem(this.SESSION_KEY, 'true');
    } else {
      sessionStorage.removeItem(this.SESSION_KEY);
    }
  }

  getAuthData() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  }

  getCurrentDID() {
    const data = this.getAuthData();
    return data?.did || null;
  }


  getIssuerInfo() {
    const data = this.getAuthData();
    if (!data) return null;
    
    return {
      did: data.did,
      name: data.name,
      domain: data.domain,
      description: data.description,
      website: data.website,
      logoUrl: data.logoUrl,
    };
  }

  generateNewSeedPhrase() {
    return generateSeedPhrase();
  }

  validateSeedPhrase(seedPhrase) {
    return validateSeedPhrase(seedPhrase);
  }

  async setupAuth(issuerData, seedPhrase, pin) {
    try {
      // Validate inputs
      if (!validateSeedPhrase(seedPhrase)) {
        throw new Error('Invalid seed phrase');
      }
      if (!validatePIN(pin)) {
        throw new Error('PIN must be 6 digits');
      }

      // Derive auth token from seed phrase
      const authToken = await deriveAuthToken(seedPhrase);

      // Send auth token to backend to set auth_hash
      const response = await fetch(`${API_BASE}/api/issuer/${issuerData.id}/set-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auth_token: authToken }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to set authentication');
      }

      // Encrypt seed phrase with PIN
      const encryptedSeed = encryptData(seedPhrase, pin);

      // Store encrypted data locally
      const authData = {
        did: issuerData.id,
        name: issuerData.name,
        domain: issuerData.domain,
        description: issuerData.description,
        website: issuerData.website,
        logoUrl: issuerData.logo_url,
        encryptedSeed,
        setupAt: new Date().toISOString(),
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(authData));
      this.setSessionAuthenticated(true);

      return { success: true };
    } catch (error) {
      console.error('Setup auth error:', error);
      throw error;
    }
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('issuerDID');
    this.setSessionAuthenticated(false);
  }

  async loginWithPIN(pin) {
    try {
      // Get stored auth data
      const authData = this.getAuthData();
      if (!authData || !authData.encryptedSeed) {
        throw new Error('No authentication data found. Please complete onboarding first.');
      }

      let seedPhrase;
      try {
        seedPhrase = decryptData(authData.encryptedSeed, pin);
      } catch {
        throw new Error('Incorrect PIN');
      }

      // Derive auth token
      const authToken = await deriveAuthToken(seedPhrase);

      // Authenticate with backend
      const response = await fetch(`${API_BASE}/api/issuer/${authData.did}/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auth_token: authToken }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Authentication failed');
      }

      const data = await response.json();

      // Update stored data with latest issuer info
      const updatedAuthData = {
        ...authData,
        name: data.issuer.name,
        domain: data.issuer.domain,
        description: data.issuer.description,
        website: data.issuer.website,
        logoUrl: data.issuer.logo_url,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedAuthData));
      
      // Store token for API requests
      if (data.token) {
        localStorage.setItem('token', data.token);
      } else {
        localStorage.setItem('token', authToken);
      }
      
      // Store issuer DID for API requests
      localStorage.setItem('issuerDID', authData.did);
      
      this.setSessionAuthenticated(true);

      return {
        success: true,
        issuer: data.issuer,
      };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async recoverWithSeedPhrase(seedPhrase, newPin) {
    try {
      // Validate inputs
      if (!validateSeedPhrase(seedPhrase)) {
        throw new Error('Invalid seed phrase');
      }
      if (!validatePIN(newPin)) {
        throw new Error('PIN must be 6 digits');
      }

      const authToken = await deriveAuthToken(seedPhrase);

      const authData = this.getAuthData();
      if (!authData || !authData.did) {
        throw new Error('No issuer data found. Please complete onboarding first.');
      }

      const response = await fetch(`${API_BASE}/api/issuer/${authData.did}/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auth_token: authToken }),
      });

      if (!response.ok) {
        throw new Error('Invalid seed phrase or issuer not found');
      }

      const data = await response.json();

      const encryptedSeed = encryptData(seedPhrase, newPin);

      const updatedAuthData = {
        ...authData,
        encryptedSeed,
        name: data.issuer.name,
        domain: data.issuer.domain,
        description: data.issuer.description,
        website: data.issuer.website,
        logoUrl: data.issuer.logo_url,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedAuthData));
      
      this.setSessionAuthenticated(true);

      return {
        success: true,
        issuer: data.issuer,
      };
    } catch (error) {
      console.error('Recovery error:', error);
      throw error;
    }
  }

  clearAllData() {
    this.logout();
  }
}

const issuerAuthService = new IssuerAuthService();
export default issuerAuthService;