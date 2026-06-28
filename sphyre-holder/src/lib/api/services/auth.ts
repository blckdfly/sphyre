import { api, ApiError } from '../client';
import { API_ENDPOINTS } from '../config';

export interface User {
  id: string;
  did: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'user' | 'admin' | 'issuer' | 'verifier';
  metadata?: {
    walletAddress?: string;
    issuerProfile?: {
      did: string;
      name: string;
      description?: string;
      logoUrl?: string;
    };
    verifierProfile?: {
      did: string;
      name: string;
      description?: string;
      logoUrl?: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>(API_ENDPOINTS.AUTH.LOGIN, {
        email,
        password,
      });
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', response.accessToken);
        localStorage.setItem('refresh_token', response.refreshToken);
        localStorage.setItem('user', JSON.stringify(response.user));
      }
      
      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          throw new Error('Invalid email or password');
        }
        if (error.status === 403) {
          throw new Error('Account not verified. Please check your email.');
        }
      }
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      await api.post(API_ENDPOINTS.AUTH.LOGOUT, {}, {
        token: this.getAccessToken(),
      });
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      this.clearAuth();
    }
  },

  async refreshToken(): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await api.post<{ accessToken: string; refreshToken: string }>(
        API_ENDPOINTS.AUTH.REFRESH,
        { refreshToken }
      );

      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', response.accessToken);
        localStorage.setItem('refresh_token', response.refreshToken);
      }

      return response;
    } catch (error) {
      this.clearAuth();
      throw error;
    }
  },

  async getCurrentUser(token?: string): Promise<User> {
    try {
      const response = await api.get<{ user: User }>(API_ENDPOINTS.AUTH.ME, { token });
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(response.user));
      }
      
      return response.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        try {
          const { accessToken } = await this.refreshToken();
          const response = await api.get<{ user: User }>(API_ENDPOINTS.AUTH.ME, {
            token: accessToken,
          });
          return response.user;
        } catch{
          this.clearAuth();
          throw new Error('Session expired. Please log in again.');
        }
      }
      throw error;
    }
  },

  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    const token = this.getAccessToken();
    return !!token && !this.isTokenExpired(token);
  },

  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('access_token');
  },

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refresh_token');
  },

  getCurrentUserFromStorage(): User | null {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  clearAuth(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
    }
  },

  isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 < Date.now();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error checking token expiration:', error.message);
      }
      return true;
    }
  },

  getTokenExpiration(token: string): Date | null {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return new Date(payload.exp * 1000);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error getting token expiration:', error.message);
      }
      return null;
    }
  },

  async requestPasswordReset(email: string): Promise<void> {
    await api.post('/auth/request-password-reset', { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api.post('/auth/reset-password', { token, newPassword });
  },

  async verifyEmail(token: string): Promise<void> {
    await api.post('/auth/verify-email', { token });
  },

    // In auth.ts, add this to the authService object
    async register(data: {
        email: string;
        password: string;
        name: string;
        role: 'user' | 'issuer' | 'verifier';
        metadata?: Record<string, unknown>;
    }): Promise<AuthResponse> {
        try {
            const response = await api.post<AuthResponse>(API_ENDPOINTS.AUTH.REGISTER, data);

            if (typeof window !== 'undefined') {
                localStorage.setItem('access_token', response.accessToken);
                localStorage.setItem('refresh_token', response.refreshToken);
                localStorage.setItem('user', JSON.stringify(response.user));
            }

            return response;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new Error('Registration failed');
        }
    }
};



export default authService;
