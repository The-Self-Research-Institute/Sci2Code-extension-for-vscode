import { ApiError, type RequestOptions, type Transport } from '../../api/transport';

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

const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
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
      entry.resolve(msg.response);
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
  request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options: RequestOptions = {}): Promise<T> {
    attachListenerOnce();
    if (!window.vscode) {
      return Promise.reject(new ApiError('No VS Code webview bridge available', 0));
    }
    const requestId = genRequestId();
    return new Promise<T>((resolve, reject) => {
      pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
      window.vscode!.postMessage({
        type: METHOD_TO_MESSAGE_TYPE[method],
        requestId,
        url: path,
        params: options.params,
        body: options.body,
        headers: options.headers,
      });
    });
  }
}
