import * as vscode from "vscode";
import * as fs from "fs";
import { ReplicaAuthSession, isExpired, isNearExpiry } from "./authSession";
import { dataserverRequest, dataserverUploadFile, dataserverDownloadFile } from "./dataserverClient";

const HTTP_METHOD_BY_MESSAGE_TYPE: Record<string, "GET" | "POST" | "PUT" | "PATCH" | "DELETE"> = {
  apiGet: "GET",
  apiPost: "POST",
  apiPut: "PUT",
  apiPatch: "PATCH",
  apiDelete: "DELETE",
};

interface ApiMessage {
  type: string;
  requestId: string;
  url: string;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

interface UploadFileMessage {
  type: "apiUploadFile";
  requestId: string;
  url: string;
  filename: string;
  contentType: string;
  base64Data: string;
  ifUnmodifiedSinceVersion?: number;
}

interface DownloadFileMessage {
  type: "apiDownloadFile";
  requestId: string;
  url: string;
}

/**
 * VS Code WebviewPanel host for the standalone Zotero Replica UI
 * (zotero-replica/ontology-library-ui). Locates the already-built Vite
 * output (`npm run build:vscode`) and loads it with an appropriate CSP, and
 * implements the host side of the postMessage bridge the webview's
 * host/vscode/* code already expects (see vscodeAuthProvider.ts,
 * vscodeTransport.ts) - a persistent authenticated session backed by
 * SecretStorage, and every api/*.ts call proxied through here so the
 * webview's own CSP never needs a `connect-src` grant (all network requests
 * happen in this Node process, not in the webview).
 */
export class ZoteroReplicaPanel {
  public static currentPanel: ZoteroReplicaPanel | undefined;
  public static readonly viewType = "zoteroReplica";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly authSession: ReplicaAuthSession;
  private readonly disposables: vscode.Disposable[] = [];

  public static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ZoteroReplicaPanel.currentPanel) {
      ZoteroReplicaPanel.currentPanel.panel.reveal(column);
      return;
    }

    const distRoot = vscode.Uri.joinPath(context.extensionUri, "zotero-replica", "ontology-library-ui", "dist");

    const panel = vscode.window.createWebviewPanel(
      ZoteroReplicaPanel.viewType,
      "Zotero Replica",
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [distRoot],
      }
    );

    ZoteroReplicaPanel.currentPanel = new ZoteroReplicaPanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.extensionUri = context.extensionUri;
    this.authSession = new ReplicaAuthSession(context.secrets);

    this.panel.webview.html = this.buildHtml();
    this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message), null, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async handleMessage(message: { type?: string } & Record<string, unknown>): Promise<void> {
    switch (message.type) {
      case "ready": {
        const status = await this.resolveAuthStatus();
        void this.panel.webview.postMessage({ type: "authStatus", ...status });
        return;
      }
      case "logout": {
        await this.authSession.clear();
        void this.panel.webview.postMessage({ type: "authStatus", available: false });
        return;
      }
      case "apiGet":
      case "apiPost":
      case "apiPut":
      case "apiPatch":
      case "apiDelete":
        await this.handleApiMessage(message as unknown as ApiMessage);
        return;
      case "apiUploadFile":
        await this.handleUploadFileMessage(message as unknown as UploadFileMessage);
        return;
      case "apiDownloadFile":
        await this.handleDownloadFileMessage(message as unknown as DownloadFileMessage);
        return;
      default:
        return;
    }
  }

  private async handleUploadFileMessage(message: UploadFileMessage): Promise<void> {
    try {
      const token = await this.authSession.getToken();
      const result = await dataserverUploadFile(message.url, {
        filename: message.filename,
        contentType: message.contentType,
        base64Data: message.base64Data,
        token,
        ifUnmodifiedSinceVersion: message.ifUnmodifiedSinceVersion,
      });
      if (!result.ok) {
        void this.panel.webview.postMessage({
          type: "apiResponse",
          requestId: message.requestId,
          error: { message: result.errorMessage ?? `Upload failed with status ${result.status}`, status: result.status },
        });
        return;
      }
      void this.panel.webview.postMessage({
        type: "apiResponse",
        requestId: message.requestId,
        response: undefined,
        libraryVersion: result.libraryVersion,
      });
    } catch (e) {
      void this.panel.webview.postMessage({
        type: "apiResponse",
        requestId: message.requestId,
        error: { message: e instanceof Error ? e.message : "Could not reach the Replica dataserver.", status: 0 },
      });
    }
  }

  private async handleDownloadFileMessage(message: DownloadFileMessage): Promise<void> {
    try {
      const token = await this.authSession.getToken();
      const result = await dataserverDownloadFile(message.url, { token });
      if (!result.ok) {
        void this.panel.webview.postMessage({
          type: "apiResponse",
          requestId: message.requestId,
          error: { message: result.errorMessage ?? `Download failed with status ${result.status}`, status: result.status },
        });
        return;
      }
      void this.panel.webview.postMessage({
        type: "apiResponse",
        requestId: message.requestId,
        response: { base64: result.base64, contentType: result.contentType, filename: result.filename },
      });
    } catch (e) {
      void this.panel.webview.postMessage({
        type: "apiResponse",
        requestId: message.requestId,
        error: { message: e instanceof Error ? e.message : "Could not reach the Replica dataserver.", status: 0 },
      });
    }
  }

  /**
   * Decodes the stored token (if any) to answer "is this session usable" -
   * never a network call itself, so opening the panel is instant. A
   * near-expiry token triggers a fire-and-forget refresh (see
   * AuthController#refresh) so the NEXT check finds a fresh one; a
   * genuinely expired one means logged-out, correctly requiring real
   * re-authentication rather than pretending it's still valid.
   */
  private async resolveAuthStatus(): Promise<{ available: boolean; userId?: string; email?: string }> {
    const payload = await this.authSession.getPayload();
    if (!payload || isExpired(payload)) {
      return { available: false };
    }
    if (isNearExpiry(payload)) {
      void this.refreshTokenSilently();
    }
    return { available: true, userId: payload.userId, email: payload.email };
  }

  private async refreshTokenSilently(): Promise<void> {
    const token = await this.authSession.getToken();
    if (!token) return;
    try {
      const result = await dataserverRequest<{ token: string }>("POST", "/auth/refresh", { token });
      if (result.ok && result.data?.token) {
        await this.authSession.setToken(result.data.token);
      }
    } catch {
      // Offline or dataserver unreachable - the current token keeps working until it actually expires.
    }
  }

  private async handleApiMessage(message: ApiMessage): Promise<void> {
    const method = HTTP_METHOD_BY_MESSAGE_TYPE[message.type];
    const isAuthEndpoint = message.url === "/auth/login" || message.url === "/auth/register";

    try {
      const token = isAuthEndpoint ? undefined : await this.authSession.getToken();
      const result = await dataserverRequest<Record<string, unknown>>(method, message.url, {
        params: message.params,
        body: message.body,
        headers: message.headers,
        token,
      });

      if (!result.ok) {
        void this.panel.webview.postMessage({
          type: "apiResponse",
          requestId: message.requestId,
          error: {
            message: (result.data?.message as string | undefined) ?? `Request failed with status ${result.status}`,
            status: result.status,
            data: result.data,
          },
        });
        return;
      }

      // /auth/login and /auth/register return a JWT - it's persisted here and
      // never forwarded to the webview (see authSession.ts's doc comment).
      if (isAuthEndpoint && typeof result.data?.token === "string") {
        await this.authSession.setToken(result.data.token as string);
        const { token: _omit, ...safeResponse } = result.data;
        void this.panel.webview.postMessage({
          type: "apiResponse",
          requestId: message.requestId,
          response: safeResponse,
          libraryVersion: result.libraryVersion,
          totalResults: result.totalResults,
        });
        return;
      }

      void this.panel.webview.postMessage({
        type: "apiResponse",
        requestId: message.requestId,
        response: result.data,
        libraryVersion: result.libraryVersion,
        totalResults: result.totalResults,
      });
    } catch (e) {
      void this.panel.webview.postMessage({
        type: "apiResponse",
        requestId: message.requestId,
        error: { message: e instanceof Error ? e.message : "Could not reach the Replica dataserver.", status: 0 },
      });
    }
  }

  /**
   * Reads ontology-library-ui/dist/index.html (Vite build, `--base ./` so
   * every asset reference is relative) and rewrites those relative
   * references to `asWebviewUri` URIs rooted at the dist folder - the only
   * way a webview may load local files, per VS Code's webview security model.
   */
  private buildHtml(): string {
    const webview = this.panel.webview;
    const distRoot = vscode.Uri.joinPath(this.extensionUri, "zotero-replica", "ontology-library-ui", "dist");
    const indexPath = vscode.Uri.joinPath(distRoot, "index.html").fsPath;

    if (!fs.existsSync(indexPath)) {
      return this.buildMissingHtml();
    }

    let html = fs.readFileSync(indexPath, "utf8");
    const distWebviewUri = webview.asWebviewUri(distRoot).toString();
    const nonce = getNonce();

    html = html.replace(/(src|href)="\.\/(.*?)"/g, (_match, attr, relPath) => `${attr}="${distWebviewUri}/${relPath}"`);
    html = html.replace(/<script /g, `<script nonce="${nonce}" `);

    // No connect-src grant: every dataserver call happens in this Node
    // process (see handleApiMessage), never in the webview itself.
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    // acquireVsCodeApi() may only be called once per webview session - this
    // is that one call, made before the bundle loads so main.tsx's
    // isVsCodeHost()/installVsCodeHost() see window.vscode already in place.
    html = html.replace(
      "<head>",
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">\n    <script nonce="${nonce}">window.vscode = acquireVsCodeApi();</script>`
    );

    return html;
  }

  private buildMissingHtml(): string {
    return `<!doctype html>
<html>
  <body style="font-family: var(--vscode-font-family, sans-serif); padding: 2rem; color: var(--vscode-foreground);">
    <h2>Zotero Replica UI is not built yet</h2>
    <p>Run the following from the repository root, then reopen this panel:</p>
    <pre style="background: var(--vscode-textCodeBlock-background, #0002); padding: 12px; border-radius: 4px;">cd zotero-replica/ontology-library-ui
npm install
npm run build:vscode</pre>
  </body>
</html>`;
  }

  private dispose(): void {
    ZoteroReplicaPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
