/**
 * Transport is the seam between the API layer and whatever host the UI is
 * running in (plain browser today; a VS Code postMessage bridge in a later
 * phase, mirroring ontology-vscode-extension/webview-src/services/apiClient.ts).
 * Nothing in api/*.ts or core/ imports fetch/axios/vscode directly - only a
 * Transport implementation does, so swapping hosts never touches call sites.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  /** Set when the response has no JSON body (e.g. 204s, attachment HEAD-style info calls). */
  expectEmptyBody?: boolean;
}

export interface Transport {
  request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options?: RequestOptions): Promise<T>;
}