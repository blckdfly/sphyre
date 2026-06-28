import {
  generateSeedPhrase,
  validateSeedPhrase,
  generateWalletData,
  encryptData,
  decryptData,
  deriveAuthToken,
  WalletData,
  signMessageEd25519,
  signBase64Ed25519,
  didKeyFromSeedPhrase,
} from '@/lib/crypto';

const WALLET_STORAGE_KEY = 'sphyre_wallet';
const WALLET_DATA_KEY = 'sphyre_wallet_data';
const WALLET_ANON_SECRET_KEY = 'sphyre_wallet_anon_secret_map';
const WALLET_INITIALIZED_KEY = 'sphyre_wallet_initialized';
const SESSION_AUTH_KEY = 'sphyre_session_auth';
const PIN_ENCRYPTED_SEED_KEY = 'sphyre_pin_encrypted_seed';
const AUTO_LOGIN_ENABLED_KEY = 'sphyre_auto_login';
const PENDING_REDIRECT_KEY = 'pending_presentation_redirect';

interface EncryptedSeedResponse {
  success: boolean;
  encrypted_seed_blob?: string;
  encrypted_seed_updated_at?: string;
  has_encrypted_seed: boolean;
}

export interface EncryptedSeedSyncResult {
  synced: boolean;
  status?: EncryptedSeedResponse | null;
  reason?: 'missing_auth' | 'backend_error' | 'network_error';
  errorMessage?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.sphyre.tech';

export interface WalletInfo extends WalletData {
  seedPhrase?: string; 
  isLocked: boolean;
}

export interface BackendWalletResponse {
  success?: boolean;
  did: string;
  public_key: string;
  kyber_public_key: string;
  created_at: string;
  credential_count: number;
}

class WalletService {
  private lastEncryptedSeedStatus: EncryptedSeedResponse | null = null;

  getLastEncryptedSeedStatus(): EncryptedSeedResponse | null {
    return this.lastEncryptedSeedStatus;
  }

  async refreshEncryptedSeedStatus(): Promise<EncryptedSeedResponse | null> {
    try {
      return await this.fetchEncryptedSeedFromBackend();
    } catch (error) {
      console.warn('Failed to refresh encrypted seed status from backend:', error);
      return null;
    }
  }

  isInitialized(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(WALLET_INITIALIZED_KEY) === 'true';
  }

  storeAnonymousSecret(credentialId: string, secretHex: string, pin?: string): void {
    if (typeof window === 'undefined') return;
    const did = this.getCurrentDID();
    if (!did) return;

    const mapRaw = localStorage.getItem(WALLET_ANON_SECRET_KEY);
    const map: Record<string, string> = mapRaw ? JSON.parse(mapRaw) : {};

    const key = `${did}::${credentialId}`;

    const secretToStore = pin ? encryptData(secretHex, pin) : secretHex;

    map[key] = JSON.stringify({
      encrypted: Boolean(pin),
      value: secretToStore,
      stored_at: new Date().toISOString(),
    });

    localStorage.setItem(WALLET_ANON_SECRET_KEY, JSON.stringify(map));
  }

  getAnonymousSecret(credentialId: string, pin?: string): string | null {
    if (typeof window === 'undefined') return null;
    const did = this.getCurrentDID();
    if (!did) return null;

    const mapRaw = localStorage.getItem(WALLET_ANON_SECRET_KEY);
    if (!mapRaw) return null;

    const map: Record<string, string> = JSON.parse(mapRaw);
    const key = `${did}::${credentialId}`;
    const recordRaw = map[key];
    if (!recordRaw) return null;

    try {
      const record = JSON.parse(recordRaw) as { encrypted: boolean; value: string };
      if (!record.encrypted) {
        return record.value;
      }

      if (!pin) {
        throw new Error('PIN required to decrypt anonymous secret');
      }

      return decryptData(record.value, pin);
    } catch (error) {
      console.error('Failed to retrieve anonymous master secret:', error);
      return null;
    }
  }

  async signMessageWithPin(message: string, pin: string): Promise<string> {
    if (typeof window === 'undefined') {
      throw new Error('Not in browser environment');
    }
    const encrypted = localStorage.getItem(PIN_ENCRYPTED_SEED_KEY);
    if (!encrypted) {
      throw new Error('No encrypted seed phrase found');
    }
    const seedPhrase = decryptData(encrypted, pin);
    if (!validateSeedPhrase(seedPhrase)) {
      throw new Error('Invalid decrypted data');
    }
    return signMessageEd25519(message, seedPhrase);
  }

  async signBase64WithPin(base64Message: string, pin: string): Promise<string> {
    if (typeof window === 'undefined') {
      throw new Error('Not in browser environment');
    }
    const encrypted = localStorage.getItem(PIN_ENCRYPTED_SEED_KEY);
    if (!encrypted) {
      throw new Error('No encrypted seed phrase found');
    }
    const seedPhrase = decryptData(encrypted, pin);
    if (!validateSeedPhrase(seedPhrase)) {
      throw new Error('Invalid decrypted data');
    }
    return signBase64Ed25519(base64Message, seedPhrase);
  }

  getDidKeyFromSession(): string | null {
    const seed = this.getSeedPhraseFromSession();
    if (!seed) return null;
    return didKeyFromSeedPhrase(seed);
  }

  deriveDidKeyFromPin(pin: string): string {
    if (typeof window === 'undefined') {
      throw new Error('Not in browser environment');
    }
    const encrypted = localStorage.getItem(PIN_ENCRYPTED_SEED_KEY);
    if (!encrypted) {
      throw new Error('No encrypted seed phrase found');
    }
    const seedPhrase = decryptData(encrypted, pin);
    if (!validateSeedPhrase(seedPhrase)) {
      throw new Error('Invalid decrypted data');
    }
    return didKeyFromSeedPhrase(seedPhrase);
  }

  async createNewWallet(existingSeedPhrase?: string): Promise<{ seedPhrase: string; walletData: WalletData }> {
    const seedPhrase = existingSeedPhrase ?? generateSeedPhrase();
    const walletData = await this.provisionWalletFromSeed(seedPhrase);
    return { seedPhrase, walletData };
  }

  async provisionWalletFromSeed(seedPhrase: string): Promise<WalletData> {
    if (!validateSeedPhrase(seedPhrase)) {
      throw new Error('Invalid seed phrase');
    }

    const authToken = await deriveAuthToken(seedPhrase);

    try {
      const response = await fetch(`${API_URL}/api/auth/create-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_token: authToken }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create wallet');
      }

      const backendWallet: BackendWalletResponse = await response.json();

      const walletData: WalletData = {
        did: backendWallet.did,
        publicKey: backendWallet.public_key,
        ethereumAddress: '',
        createdAt: backendWallet.created_at,
      };

      this.storeWalletData(walletData);
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', authToken);
        localStorage.setItem(WALLET_INITIALIZED_KEY, 'true');
      }

      return walletData;
    } catch (error) {
      console.error('Failed to create wallet:', error);
      const walletData = generateWalletData(seedPhrase);
      this.storeWalletData(walletData);
      if (typeof window !== 'undefined') {
        localStorage.setItem(WALLET_INITIALIZED_KEY, 'true');
      }
      return walletData;
    }
  }

  async recoverWallet(seedPhrase: string): Promise<WalletData> {
    if (!validateSeedPhrase(seedPhrase)) {
      throw new Error('Invalid seed phrase');
    }
    
    // Derive auth token from seed phrase
    const authToken = await deriveAuthToken(seedPhrase);
    
    // Check if we have existing wallet data in localStorage
    const existingWalletData = this.getWalletData();
    const existingAuthToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    
    // If auth token matches, reuse existing wallet data (prevents DID rotation)
    if (existingWalletData && existingAuthToken === authToken) {
      console.log('Reusing existing wallet data - auth token matched');
      this.storeWalletData(existingWalletData);
      if (typeof window !== 'undefined') {
        localStorage.setItem(WALLET_INITIALIZED_KEY, 'true');
      }
      return existingWalletData;
    }
    
    try {
      // Try to login with existing wallet
      const response = await fetch(`${API_URL}/api/auth/login-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_token: authToken }),
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // Wallet doesn't exist on backend, create new one
          console.log('Creating new wallet on backend (404 response)');
          const createResponse = await fetch(`${API_URL}/api/auth/create-wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auth_token: authToken }),
          });
          
          if (!createResponse.ok) {
            throw new Error('Failed to create wallet');
          }
          
          const backendWallet: BackendWalletResponse = await createResponse.json();
          
          const walletData: WalletData = {
            did: backendWallet.did,
            publicKey: backendWallet.public_key,
            ethereumAddress: '',
            createdAt: backendWallet.created_at,
          };
          
          this.storeWalletData(walletData);
          if (typeof window !== 'undefined') {
            localStorage.setItem('auth_token', authToken);
            localStorage.setItem(WALLET_INITIALIZED_KEY, 'true');
          }
          
          return walletData;
        }
        throw new Error('Failed to recover wallet');
      }
      
      const backendWallet: BackendWalletResponse = await response.json();
      
      // Create wallet data with backend DID
      const walletData: WalletData = {
        did: backendWallet.did,
        publicKey: backendWallet.public_key,
        ethereumAddress: '',
        createdAt: backendWallet.created_at,
      };
      
      // Store wallet data and auth token
      this.storeWalletData(walletData);
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', authToken);
        localStorage.setItem(WALLET_INITIALIZED_KEY, 'true');
      }
      
      return walletData;
    } catch (error) {
      console.error('Failed to recover wallet:', error);
      // Fallback to local generation only if no existing data
      if (existingWalletData) {
        console.log('Backend failed, reusing existing wallet data');
        return existingWalletData;
      }
      const walletData = generateWalletData(seedPhrase);
      this.storeWalletData(walletData);
      if (typeof window !== 'undefined') {
        localStorage.setItem(WALLET_INITIALIZED_KEY, 'true');
      }
      return walletData;
    }
  }

  private storeWalletData(walletData: WalletData): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(WALLET_DATA_KEY, JSON.stringify(walletData));
    }
  }

  private getWalletData(): WalletData | null {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(WALLET_DATA_KEY);
    if (!data) return null;
    try {
      const parsedData = JSON.parse(data);
      if (parsedData && typeof parsedData === 'object') {
        if ('did' in parsedData) {
          return parsedData as WalletData;
        }
        if ('walletData' in parsedData && parsedData.walletData) {
          return parsedData.walletData as WalletData;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  getCurrentDID(): string | null {
    const walletData = this.getWalletData();
    return walletData?.did || null;
  }

  clearWallet(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(WALLET_STORAGE_KEY);
      localStorage.removeItem(WALLET_DATA_KEY);
      localStorage.removeItem(WALLET_INITIALIZED_KEY);
      localStorage.removeItem('auth_token');
      this.setSessionAuthenticated(false);
      this.clearSeedPhraseFromSession();
      this.disablePersistentLogin();
    }
  }

  storeSeedPhraseInSession(seedPhrase: string): void {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('temp_seed_phrase', seedPhrase);
    }
  }

  getSeedPhraseFromSession(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('temp_seed_phrase');
  }

  clearSeedPhraseFromSession(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('temp_seed_phrase');
    }
  }

  async validateSeedPhraseForWallet(seedPhrase: string): Promise<boolean> {
    if (!validateSeedPhrase(seedPhrase)) {
      return false;
    }
    
    const walletData = this.getWalletData();
    if (!walletData) {
      return false;
    }
    
    try {
      // Derive auth token and check if it matches stored one
      const authToken = await deriveAuthToken(seedPhrase);
      const storedAuthToken = localStorage.getItem('auth_token');
      
      // If we have a stored auth token, compare them
      if (storedAuthToken) {
        return authToken === storedAuthToken;
      }
      
      // Otherwise, try to login to verify
      const response = await fetch(`${API_URL}/api/auth/login-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_token: authToken }),
      });
      
      if (response.ok) {
        const backendWallet: BackendWalletResponse = await response.json();
        return backendWallet.did === walletData.did;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to validate seed phrase:', error);
      return false;
    }
  }

  async loginWithSeedPhrase(seedPhrase: string): Promise<WalletData> {
    if (!validateSeedPhrase(seedPhrase)) {
      throw new Error('Invalid seed phrase format');
    }

    return this.recoverWallet(seedPhrase);
  }

  isSessionAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(SESSION_AUTH_KEY) === 'true';
  }

  setSessionAuthenticated(value: boolean): void {
    if (typeof window !== 'undefined') {
      if (value) {
        sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
      } else {
        sessionStorage.removeItem(SESSION_AUTH_KEY);
      }
    }
  }

  requireSessionAuth(nextPath: string, router?: { push: (path: string) => void }): boolean {
    if (this.isSessionAuthenticated()) {
      return true;
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(PENDING_REDIRECT_KEY, nextPath);
    }

    if (router) {
      router.push('/unlock');
    }

    return false;
  }

  logout(): void {
    this.setSessionAuthenticated(false);
    this.clearSeedPhraseFromSession();
    this.disablePersistentLogin();
  }

  async enablePersistentLogin(seedPhrase: string, pin: string): Promise<EncryptedSeedSyncResult> {
    if (!validateSeedPhrase(seedPhrase)) {
      throw new Error('Invalid seed phrase');
    }
    
    if (pin.length !== 6) {
      throw new Error('PIN must be 6 digits');
    }
    
    // Encrypt seed phrase with PIN
    const encrypted = encryptData(seedPhrase, pin);
    
    this.storeEncryptedSeedLocally(encrypted);

    try {
      const status = await this.syncEncryptedSeedToBackend(encrypted);
      if (status && status.success && status.has_encrypted_seed) {
        return { synced: true, status };
      }

      if (!status) {
        return {
          synced: false,
          reason: 'missing_auth',
          errorMessage: 'Auth token not available for syncing yet. The encrypted PIN will stay local until login completes.',
        };
      }

      return {
        synced: false,
        status,
        reason: 'backend_error',
        errorMessage: 'Backend did not acknowledge the encrypted seed.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync encrypted seed';
      return {
        synced: false,
        reason: 'network_error',
        errorMessage: message,
      };
    }
  }

  isPersistentLoginEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(AUTO_LOGIN_ENABLED_KEY) === 'true' &&
           !!localStorage.getItem(PIN_ENCRYPTED_SEED_KEY);
  }

  async unlockWithPin(pin: string): Promise<WalletData> {
    if (typeof window === 'undefined') {
      throw new Error('Not in browser environment');
    }

    const encrypted = await this.ensureEncryptedSeedCached();
    if (!encrypted) {
      throw new Error('No encrypted seed phrase found');
    }
    
    try {
      const seedPhrase = decryptData(encrypted, pin);
      
      if (!validateSeedPhrase(seedPhrase)) {
        throw new Error('Invalid decrypted data');
      }
      
      // Recover wallet with seed phrase
      const walletData = await this.recoverWallet(seedPhrase);
      this.setSessionAuthenticated(true);
      
      return walletData;
    } catch{
      throw new Error('Invalid PIN or corrupted data');
    }
  }

  disablePersistentLogin(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PIN_ENCRYPTED_SEED_KEY);
      localStorage.removeItem(AUTO_LOGIN_ENABLED_KEY);
    }
  }

  async recoverFromSeedPhrase(seedPhrase: string): Promise<{ walletData: WalletData }> {
    const walletData = await this.recoverWallet(seedPhrase);
    await this.ensureEncryptedSeedCached();
    return { walletData };
  }

  async updateEncryptedSeed(encryptedSeed: string): Promise<EncryptedSeedSyncResult> {
    this.storeEncryptedSeedLocally(encryptedSeed);
    try {
      const status = await this.syncEncryptedSeedToBackend(encryptedSeed);
      if (status && status.success && status.has_encrypted_seed) {
        return { synced: true, status };
      }

      if (!status) {
        return {
          synced: false,
          reason: 'missing_auth',
          errorMessage: 'Auth token not available for syncing yet. The encrypted PIN will stay local until login completes.',
        };
      }

      return {
        synced: false,
        status,
        reason: 'backend_error',
        errorMessage: 'Backend did not acknowledge the encrypted seed update.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync encrypted seed';
      console.warn('Failed to sync encrypted seed to backend:', error);
      return {
        synced: false,
        reason: 'network_error',
        errorMessage: message,
      };
    }
  }

  async getEncryptedSeed(): Promise<string | null> {
    return this.ensureEncryptedSeedCached();
  }

  private storeEncryptedSeedLocally(encryptedSeed: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PIN_ENCRYPTED_SEED_KEY, encryptedSeed);
      localStorage.setItem(AUTO_LOGIN_ENABLED_KEY, 'true');
    }
  }

  private async ensureEncryptedSeedCached(): Promise<string | null> {
    if (typeof window === 'undefined') return null;

    const existing = localStorage.getItem(PIN_ENCRYPTED_SEED_KEY);
    if (existing) {
      return existing;
    }

    try {
      const status = await this.fetchEncryptedSeedFromBackend();
      if (status?.encrypted_seed_blob) {
        this.storeEncryptedSeedLocally(status.encrypted_seed_blob);
        return status.encrypted_seed_blob;
      }
      return null;
    } catch (error) {
      console.warn('Failed to fetch encrypted seed from backend:', error);
      return null;
    }
  }

  private async syncEncryptedSeedToBackend(encryptedSeed: string): Promise<EncryptedSeedResponse | null> {
    const authToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!authToken) {
      this.lastEncryptedSeedStatus = null;
      return null;
    }

    const response = await fetch(`${API_URL}/api/auth/wallet/encrypted-seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_token: authToken, encrypted_seed_blob: encryptedSeed }),
    });

    if (!response.ok) {
      throw new Error('Failed to sync encrypted seed');
    }

    const data: EncryptedSeedResponse = await response.json();
    if (!data.success) {
      throw new Error('Backend rejected encrypted seed');
    }

    this.lastEncryptedSeedStatus = data;
    return data;
  }

  private async fetchEncryptedSeedFromBackend(): Promise<EncryptedSeedResponse | null> {
    const authToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!authToken) return null;

    const response = await fetch(`${API_URL}/api/auth/wallet/encrypted-seed/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_token: authToken }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch encrypted seed');
    }

    const data: EncryptedSeedResponse = await response.json();
    if (!data.success) {
      return null;
    }

    this.lastEncryptedSeedStatus = data;
    return data;
  }

  /**
   * Wrapper: Verify PIN and return boolean
   */
  async verifyPin(pin: string): Promise<boolean> {
    try {
      await this.unlockWithPin(pin);
      return true;
    } catch {
      return false;
    }
  }
}

export const walletService = new WalletService();
export default walletService;
export type { WalletData };
