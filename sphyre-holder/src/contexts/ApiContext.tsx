import React, { createContext, useContext, ReactNode, useEffect, useState, useCallback } from 'react';
import authService, { User } from '@/lib/api/services/auth';
import issuerService from '@/lib/api/services/issuer';
import verifierService from '@/lib/api/services/verifier';
import walletService from '@/lib/api/services/wallet';

interface ApiContextType {
  // Auth state
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  login: (email: string, password: string) => Promise<{ user: User; token: string }>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    role: 'user' | 'issuer' | 'verifier';
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  
  // Services
  auth: typeof authService;
  issuer: typeof issuerService;
  verifier: typeof verifierService;
  wallet: typeof walletService;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export const ApiProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      if (authService.isAuthenticated()) {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Error checking authentication:', error);
      authService.clearAuth();
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial auth check
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Set up token refresh interval
  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshInterval = setInterval(async () => {
      try {
        await authService.refreshToken();
      } catch (error) {
        console.error('Failed to refresh token:', error);
        await logout();
      }
    }, 15 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [isAuthenticated]);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const { user, accessToken } = await authService.login(email, password);
      setUser(user);
      setIsAuthenticated(true);
      return { user, token: accessToken };
    } finally {
      setIsLoading(false);
    }
  };

  interface UserMetadata {
    [key: string]: string | number | boolean | null | undefined;
  }
    const register = async (data: {
        email: string;
        password: string;
        name: string;
        role: 'user' | 'issuer' | 'verifier';
        metadata?: UserMetadata;
    }) => {
        try {
            setIsLoading(true);
            const { user } = await authService.register(data);
            setUser(user);
            setIsAuthenticated(true);
            // Don't return anything
        } finally {
            setIsLoading(false);
        }
    };

  const logout = async () => {
    try {
      setIsLoading(true);
      await authService.logout();
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      console.error('Error refreshing user:', error);
      await logout();
      throw error;
    }
  };

  const requestPasswordReset = async (email: string) => {
    return authService.requestPasswordReset(email);
  };

  const resetPassword = async (token: string, password: string) => {
    return authService.resetPassword(token, password);
  };

  const verifyEmail = async (token: string): Promise<void> => {
    await authService.verifyEmail(token);
  };

  return (
    <ApiContext.Provider
      value={{
        // Auth state
        user,
        isAuthenticated,
        isLoading,
        
        // Auth methods
        login,
        register,
        logout,
        refreshUser,
        requestPasswordReset,
        resetPassword,
        verifyEmail,
        
        // Services
        auth: authService,
        issuer: issuerService,
        verifier: verifierService,
        wallet: walletService,
      }}
    >
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = (): ApiContextType => {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
};

export default ApiContext;
