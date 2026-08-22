import { WebTransport } from '../host/web/webTransport';
import type { BinaryDownloadResult, RequestOptions, ResponseWithVersion, Transport, UploadFileInput } from './transport';

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
  /** Like get(), but also resolves the library-version header - see requestWithVersion's doc comment. */
  getWithVersion: <T>(path: string, options?: RequestOptions): Promise<ResponseWithVersion<T>> =>
    transport.requestWithVersion<T>('GET', path, options),
  uploadFile: (path: string, file: UploadFileInput, options?: RequestOptions) => transport.uploadFile(path, file, options),
  downloadBinary: (path: string, options?: RequestOptions): Promise<BinaryDownloadResult> => transport.downloadBinary(path, options),
};