import {
  ApiError,
  type BinaryDownloadResult,
  type RequestOptions,
  type ResponseWithVersion,
  type Transport,
  type UploadFileInput,
} from '../../api/transport';

declare global {
  interface Window {
    vscode?: { postMessage: (message: unknown) => void };
  }
}

const METHOD_TO_MESSAGE_TYPE: Record<string, string> = {
  GET: 'apiGet',
  POST: 'apiPost',
  PUT: 'apiPut',
  PATCH: 'apiPatch',
  DELETE: 'apiDelete',
};

let requestCounter = 0;
const genRequestId = () => `lib-req-${Date.now()}-${++requestCounter}`;

interface RawResponse {
  response: unknown;
  libraryVersion: number | null;
  totalResults: number | null;
}

const pending = new Map<string, { resolve: (v: RawResponse) => void; reject: (e: unknown) => void }>();
let listenerAttached = false;

function attachListenerOnce() {
  if (listenerAttached) return;
  listenerAttached = true;
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type !== 'apiResponse') return;
    const entry = pending.get(msg.requestId);
    if (!entry) return;
    pending.delete(msg.requestId);
    if (msg.error) {
      entry.reject(new ApiError(msg.error.message ?? 'Request failed', msg.error.status, msg.error.data));
    } else {
      entry.resolve({
        response: msg.response,
        libraryVersion: msg.libraryVersion ?? null,
        totalResults: msg.totalResults ?? null,
      });
    }
  });
}

/**
 * Proxies every API call through the extension host via postMessage, exactly
 * like ontology-vscode-extension/webview-src/services/apiClient.ts's VS Code
 * branch. The webview never sees the JWT - the extension host attaches it
 * from its own secret storage (see libraryPanel.ts's message handler).
 */
export class VsCodeTransport implements Transport {
  private sendRaw(message: Record<string, unknown>): Promise<RawResponse> {
    attachListenerOnce();
    if (!window.vscode) {
      return Promise.reject(new ApiError('No VS Code webview bridge available', 0));
    }
    const requestId = genRequestId();
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      window.vscode!.postMessage({ requestId, ...message });
    });
  }

  private send(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions,
  ): Promise<RawResponse> {
    return this.sendRaw({
      type: METHOD_TO_MESSAGE_TYPE[method],
      url: path,
      params: options.params,
      body: options.body,
      headers: options.headers,
    });
  }

  async request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options: RequestOptions = {}): Promise<T> {
    return (await this.send(method, path, options)).response as T;
  }

  async requestWithVersion<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<ResponseWithVersion<T>> {
    const { response, libraryVersion, totalResults } = await this.send(method, path, options);
    return { data: response as T, libraryVersion, totalResults };
  }

  async uploadFile(
    path: string,
    file: UploadFileInput,
    options: RequestOptions = {},
  ): Promise<{ libraryVersion: number | null }> {
    const ifUnmodifiedSinceVersion = options.headers?.['If-Unmodified-Since-Version'];
    const { libraryVersion } = await this.sendRaw({
      type: 'apiUploadFile',
      url: path,
      filename: file.filename,
      contentType: file.contentType,
      base64Data: file.base64Data,
      ifUnmodifiedSinceVersion: ifUnmodifiedSinceVersion !== undefined ? Number(ifUnmodifiedSinceVersion) : undefined,
    });
    return { libraryVersion };
  }

  async downloadBinary(path: string, options: RequestOptions = {}): Promise<BinaryDownloadResult> {
    const { response } = await this.sendRaw({ type: 'apiDownloadFile', url: path, params: options.params });
    return response as BinaryDownloadResult;
  }
}
