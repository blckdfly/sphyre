import { generateSeedPhrase, validateSeedPhrase, deriveAuthToken, encryptData, decryptData, validatePIN } from '../utils/crypto';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

interface VerifierData {
  id: string;
  name: string;
  organization: string;
  domain: string;
  description?: string;
  website?: string;
  logo_url?: string;
}

interface AuthData {
  did: string;
  name: string;
  organization: string;
  domain: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  encryptedSeed: string;
  setupAt: string;
}

class VerifierAuthService {
  private STORAGE_KEY = 'verifier_auth';
  private SESSION_KEY = 'verifier_session_authenticated';

  isLoggedIn(): boolean {
    const data = this.getAuthData();
    return !!data && !!data.did;
  }

  isSessionAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(this.SESSION_KEY) === 'true';
  }

  setSessionAuthenticated(value: boolean): void {
    if (typeof window === 'undefined') return;
    if (value) {
      sessionStorage.setItem(this.SESSION_KEY, 'true');
    } else {
      sessionStorage.removeItem(this.SESSION_KEY);
    }
  }

  getAuthData(): AuthData | null {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  }

  getCurrentDID(): string | null {
    const data = this.getAuthData();
    return data?.did || null;
  }

  getVerifierInfo() {
    const data = this.getAuthData();
    if (!data) return null;
    
    return {
      did: data.did,
      name: data.name,
      organization: data.organization,
      domain: data.domain,
      description: data.description,
      website: data.website,
      logoUrl: data.logoUrl,
    };
  }

  generateNewSeedPhrase(): string {
    return generateSeedPhrase();
  }

  validateSeedPhrase(seedPhrase: string): boolean {
    return validateSeedPhrase(seedPhrase);
  }

  async setupAuth(verifierData: VerifierData, seedPhrase: string, pin: string): Promise<{ success: boolean }> {
    try {
      // Validate inputs
      if (!validateSeedPhrase(seedPhrase)) {
        throw new Error('Invalid seed phrase');
      }
      if (!validatePIN(pin)) {
        throw new Error('PIN must be 4-6 digits');
      }

      // Derive auth token from seed phrase
      const authToken = await deriveAuthToken(seedPhrase);

      // Send auth token to backend to set auth_hash
      const response = await fetch(`${API_BASE}/api/verifier/${verifierData.id}/set-auth`, {
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
      const authData: AuthData = {
        did: verifierData.id,
        name: verifierData.name,
        organization: verifierData.organization,
        domain: verifierData.domain,
        description: verifierData.description,
        website: verifierData.website,
        logoUrl: verifierData.logo_url,
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

  async loginWithPIN(pin: string): Promise<{ success: boolean; verifier: VerifierData }> {
    try {
      // Get stored auth data
      const authData = this.getAuthData();
      if (!authData || !authData.encryptedSeed) {
        throw new Error('No authentication data found. Please complete onboarding first.');
      }

      // Decrypt seed phrase with PIN
      let seedPhrase: string;
      try {
        seedPhrase = decryptData(authData.encryptedSeed, pin);
      } catch {
        throw new Error('Incorrect PIN');
      }

      // Derive auth token
      const authToken = await deriveAuthToken(seedPhrase);

      // Authenticate with backend
      const response = await fetch(`${API_BASE}/api/verifier/${authData.did}/authenticate`, {
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

      // Update stored data with latest verifier info
      const updatedAuthData: AuthData = {
        ...authData,
        name: data.verifier.name,
        organization: data.verifier.organization,
        domain: data.verifier.domain,
        description: data.verifier.description,
        website: data.verifier.website,
        logoUrl: data.verifier.logo_url,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedAuthData));
      
      this.setSessionAuthenticated(true);

      return {
        success: true,
        verifier: data.verifier,
      };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Recover access with seed phrase (forgot PIN)
   */
  async recoverWithSeedPhrase(seedPhrase: string, newPin: string): Promise<{ success: boolean; verifier: VerifierData }> {
    try {
      // Validate inputs
      if (!validateSeedPhrase(seedPhrase)) {
        throw new Error('Invalid seed phrase');
      }
      if (!validatePIN(newPin)) {
        throw new Error('PIN must be 4-6 digits');
      }

      // Derive auth token
      const authToken = await deriveAuthToken(seedPhrase);

      // Get stored auth data to get DID
      const authData = this.getAuthData();
      if (!authData || !authData.did) {
        throw new Error('No verifier data found. Please complete onboarding first.');
      }

      // Authenticate with backend
      const response = await fetch(`${API_BASE}/api/verifier/${authData.did}/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ auth_token: authToken }),
      });

      if (!response.ok) {
        throw new Error('Invalid seed phrase or verifier not found');
      }

      const data = await response.json();

      // Re-encrypt with new PIN
      const encryptedSeed = encryptData(seedPhrase, newPin);

      // Update stored data
      const updatedAuthData: AuthData = {
        ...authData,
        encryptedSeed,
        name: data.verifier.name,
        organization: data.verifier.organization,
        domain: data.verifier.domain,
        description: data.verifier.description,
        website: data.verifier.website,
        logoUrl: data.verifier.logo_url,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedAuthData));
      
      this.setSessionAuthenticated(true);

      return {
        success: true,
        verifier: data.verifier,
      };
    } catch (error) {
      console.error('Recovery error:', error);
      throw error;
    }
  }

  logout(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem(this.SESSION_KEY);
  }

  clearAllData(): void {
    this.logout();
  }
}

// Export singleton instance
const verifierAuthService = new VerifierAuthService();
export default verifierAuthService;
