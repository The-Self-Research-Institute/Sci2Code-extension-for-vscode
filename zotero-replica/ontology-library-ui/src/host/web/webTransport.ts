import { getDataserverUrl } from '../../config/deploymentConfig';
import { ApiError, type RequestOptions, type Transport } from '../../api/transport';

/** Reads the JWT issued by the replica dataserver's own /auth/login|register. */
function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem('authToken');
  } catch {
    return null;
  }
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(path, getDataserverUrl());
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Direct-fetch Transport for standalone browser/Electron hosts. */
export class WebTransport implements Transport {
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = { ...options.headers };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const hasBody = options.body !== undefined;
    if (hasBody && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(buildUrl(path, options.params), {
      method,
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        /* no JSON body on this error response */
      }
      let message = `Request failed with status ${response.status}`;
      if (data && typeof data === 'object' && 'message' in data && typeof (data as any).message === 'string') {
        message = (data as { message: string }).message;
      }
      throw new ApiError(message, response.status, data);
    }

    if (options.expectEmptyBody || response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}