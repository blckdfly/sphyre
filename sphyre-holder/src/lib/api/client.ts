import { API_BASE_URL, DEFAULT_HEADERS, getAuthHeaders } from './config';

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  token?: string;
  rawResponse?: boolean;
  body?: string | FormData | Blob | URLSearchParams | ReadableStream | null;
};

export class ApiError<T = unknown> extends Error {
    status: number;
    data: T;
    constructor(message: string, status: number, data: T) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  
  if (!response.ok) {
    const errorData = isJson ? await response.json() : await response.text();
    throw new ApiError(
      errorData?.message || response.statusText,
      response.status,
      errorData
    );
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  if (!isJson) {
    // If the response is not JSON, we can't guarantee it matches T
    // So we'll cast it to unknown first, then to T
    return response.text() as unknown as Promise<T>;
  }
  
  return response.json() as Promise<T>;
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE_URL}${path}`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
  }
  
  return url.toString();
}

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string = API_BASE_URL, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.defaultHeaders = { ...DEFAULT_HEADERS, ...defaultHeaders };
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { headers = {}, params = {}, token } = options;
    const url = buildUrl(path, params);
    
    const requestOptions: RequestInit = {
      method,
      headers: {
        ...this.defaultHeaders,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...headers,
      },
      credentials: 'include',
    };

    try {
      const response = await fetch(url, requestOptions);
      return await handleResponse<T>(response);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError('Network error', 0, { message: error.message });
    }
  }

  get<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>('GET', path, options);
  }

  post<T, D = unknown>(path: string, data?: D, options: RequestOptions = {}) {
    return this.request<T>('POST', path, {
      ...options,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put<T, D = unknown>(path: string, data: D, options: RequestOptions = {}) {
    return this.request<T>('PUT', path, {
      ...options,
      body: JSON.stringify(data),
    });
  }

  delete<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>('DELETE', path, options);
  }

  upload<T>(path: string, file: File, options: RequestOptions = {}) {
    const { headers = {}, params = {}, token } = options;
    const formData = new FormData();
    formData.append('file', file);
    
    const url = buildUrl(path, params);
    
    const requestOptions: RequestInit & { skipContentType: boolean } = {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...headers,
      },
      body: formData,
      credentials: 'include',
      skipContentType: true,
    };

    return fetch(url, requestOptions).then(handleResponse<T>);
  }
}

export const api = new ApiClient();

export const getAuthenticatedApi = (token?: string) => {
  return new ApiClient(API_BASE_URL, getAuthHeaders(token));
};
