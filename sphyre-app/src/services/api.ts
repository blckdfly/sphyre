import { useState, useEffect } from 'react';

// API base URL - use environment variable or fallback
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'http://fortro-engine:3000'
    : 'http://localhost:8000');

// Types for API responses
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

// Authentication API

export interface User {
  id: string;
  username: string;
  email: string;
  did: string;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse extends ApiResponse<User> {
  user: User;
  token: string;
}

export interface RegisterData {
  username: string;
  password: string;
  email: string;
}

export interface LoginData {
  username: string;
  password: string;
}

// Wallet API

export interface Wallet {
  id: string;
  did: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Credential {
  id: string;
  issuer_did: string;
  owner_did: string;
  credential_type: string;
  schema_id: string;
  credential_data: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

// API client functions

// Helper function for making API requests
async function fetchApi<T>(
  endpoint: string, 
  method: string = 'GET', 
  data?: Record<string, unknown>, 
  token?: string
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'An error occurred');
  }

  return response.json();
}

// Authentication functions
export async function registerUser(data: RegisterData): Promise<ApiResponse<User>> {
  return fetchApi<ApiResponse<User>>('/auth/register', 'POST', data as unknown as Record<string, unknown>);
}

export async function loginUser(data: LoginData): Promise<LoginResponse> {
  return fetchApi<LoginResponse>('/auth/login', 'POST', data as unknown as Record<string, unknown>);
}

// Define a type for DID response
export interface DidResponse {
  did: string;
  method: string;
  created_at: string;
}

export async function generateDid(token: string, method: string = 'key'): Promise<ApiResponse<DidResponse>> {
  return fetchApi<ApiResponse<DidResponse>>('/auth/generate-did', 'POST', { method }, token);
}

// Wallet functions
export async function createWallet(token: string, data: { did: string, name: string, description: string }): Promise<ApiResponse<Wallet>> {
  return fetchApi<ApiResponse<Wallet>>('/wallet/create', 'POST', data, token);
}

export async function getWallet(token: string, did: string): Promise<ApiResponse<Wallet>> {
  return fetchApi<ApiResponse<Wallet>>(`/wallet/${did}`, 'GET', undefined, token);
}

export async function getWalletCredentials(token: string, did: string): Promise<ApiResponse<Credential[]>> {
  return fetchApi<ApiResponse<Credential[]>>(`/wallet/${did}/credentials`, 'GET', undefined, token);
}

export async function getCredential(token: string, did: string, credentialId: string): Promise<ApiResponse<Credential>> {
  return fetchApi<ApiResponse<Credential>>(`/wallet/${did}/credentials/${credentialId}`, 'GET', undefined, token);
}

export interface CredentialMetadata {
  name?: string;
  description?: string;
  issuer_name?: string;
  issued_date?: string;
  [key: string]: string | undefined;
}

export async function importCredential(token: string, did: string, data: { credential_jwt: string, metadata?: CredentialMetadata }): Promise<ApiResponse<Credential>> {
  return fetchApi<ApiResponse<Credential>>(`/wallet/${did}/credentials/import`, 'POST', data, token);
}

// Define interfaces for the response types
export interface ShareResponse {
  share_id: string;
  credential_ids: string[];
  recipient_did: string;
  purpose: string;
  expiration: string;
  created_at: string;
}

export interface DeleteResponse {
  deleted: boolean;
  credential_id: string;
}

export async function shareCredentials(
  token: string, 
  did: string, 
  data: { 
    credential_ids: string[], 
    recipient_did: string, 
    purpose: string, 
    expiration: string 
  }
): Promise<ApiResponse<ShareResponse>> {
  return fetchApi<ApiResponse<ShareResponse>>(`/wallet/${did}/credentials/share`, 'POST', data, token);
}

export async function deleteCredential(token: string, did: string, credentialId: string): Promise<ApiResponse<DeleteResponse>> {
  return fetchApi<ApiResponse<DeleteResponse>>(`/wallet/${did}/credentials/${credentialId}`, 'DELETE', undefined, token);
}

// Custom hook for API health check
export function useApiHealth() {
  const [isHealthy, setIsHealthy] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
          setIsHealthy(true);
        } else {
          setError('API is not healthy');
        }
      } catch {
        setError('Failed to connect to API');
      } finally {
        setIsLoading(false);
      }
    };

    checkHealth();
  }, []);

  return { isHealthy, isLoading, error };
}