import { getDataserverUrl } from '../../config/deploymentConfig';
import {
  ApiError,
  type BinaryDownloadResult,
  type RequestOptions,
  type ResponseWithVersion,
  type Transport,
  type UploadFileInput,
} from '../../api/transport';

/** Chunked to avoid a single giant String.fromCharCode(...spread) call blowing the call stack on large files. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function filenameFromContentDisposition(headerValue: string | null): string {
  if (!headerValue) return 'download';
  const match = /filename="?([^";]+)"?/.exec(headerValue);
  return match ? match[1] : 'download';
}

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
  private async doFetch<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions,
  ): Promise<{ data: T; libraryVersion: number | null; totalResults: number | null }> {
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

    const rawVersion = response.headers.get('Last-Modified-Version');
    const libraryVersion = rawVersion !== null && rawVersion !== '' ? Number(rawVersion) : null;
    const rawTotal = response.headers.get('Total-Results');
    const totalResults = rawTotal !== null && rawTotal !== '' ? Number(rawTotal) : null;

    if (options.expectEmptyBody || response.status === 204) {
      return { data: undefined as T, libraryVersion, totalResults };
    }
    return { data: (await response.json()) as T, libraryVersion, totalResults };
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    return (await this.doFetch<T>(method, path, options)).data;
  }

  async requestWithVersion<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<ResponseWithVersion<T>> {
    return this.doFetch<T>(method, path, options);
  }

  async uploadFile(
    path: string,
    file: UploadFileInput,
    options: RequestOptions = {},
  ): Promise<{ libraryVersion: number | null }> {
    const headers: Record<string, string> = { ...options.headers };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    // No Content-Type here - the browser sets the multipart boundary itself when given a FormData body.

    const blob = await (await fetch(`data:${file.contentType};base64,${file.base64Data}`)).blob();
    const form = new FormData();
    form.append('file', blob, file.filename);

    const response = await fetch(buildUrl(path, options.params), { method: 'POST', headers, body: form });
    if (!response.ok) {
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        /* no JSON body */
      }
      let message = `Upload failed with status ${response.status}`;
      if (data && typeof data === 'object' && 'message' in data && typeof (data as any).message === 'string') {
        message = (data as { message: string }).message;
      }
      throw new ApiError(message, response.status, data);
    }

    const rawVersion = response.headers.get('Last-Modified-Version');
    return { libraryVersion: rawVersion !== null && rawVersion !== '' ? Number(rawVersion) : null };
  }

  async downloadBinary(path: string, options: RequestOptions = {}): Promise<BinaryDownloadResult> {
    const headers: Record<string, string> = { ...options.headers };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(buildUrl(path, options.params), { method: 'GET', headers });
    if (!response.ok) {
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        /* no JSON body */
      }
      let message = `Download failed with status ${response.status}`;
      if (data && typeof data === 'object' && 'message' in data && typeof (data as any).message === 'string') {
        message = (data as { message: string }).message;
      }
      throw new ApiError(message, response.status, data);
    }

    const buffer = await response.arrayBuffer();
    return {
      base64: arrayBufferToBase64(buffer),
      contentType: response.headers.get('Content-Type') ?? 'application/octet-stream',
      filename: filenameFromContentDisposition(response.headers.get('Content-Disposition')),
    };
  }
}