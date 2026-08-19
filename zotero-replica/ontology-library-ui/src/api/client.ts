import { WebTransport } from '../host/web/webTransport';
import type { RequestOptions, Transport } from './transport';

export { ApiError } from './transport';

/**
 * Host-agnostic API client. Defaults to the direct-fetch WebTransport; a VS
 * Code host adapter can call setTransport() at startup to route requests
 * through the extension's postMessage proxy instead, without any api/*.ts
 * call site changing.
 */
let transport: Transport = new WebTransport();

export function setTransport(next: Transport): void {
  transport = next;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => transport.request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    transport.request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    transport.request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    transport.request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => transport.request<T>('DELETE', path, options),
};