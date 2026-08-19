import * as vscode from "vscode";
import * as fs from "fs";

/**
 * Thin VS Code WebviewPanel host for the standalone Zotero Replica UI
 * (zotero-replica/ontology-library-ui). This file contains no replica
 * business logic - it only locates the already-built Vite output
 * (`npm run build:vscode` in that package) and loads it into a panel with
 * an appropriate CSP. Deliberately isolated under src/zoteroReplica/ so it
 * can be lifted out alongside zotero-replica/ later with minimal fuss.
 */
export class ZoteroReplicaPanel {
  public static currentPanel: ZoteroReplicaPanel | undefined;
  public static readonly viewType = "zoteroReplica";

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ZoteroReplicaPanel.currentPanel) {
      ZoteroReplicaPanel.currentPanel.panel.reveal(column);
      return;
    }

    const distRoot = vscode.Uri.joinPath(extensionUri, "zotero-replica", "ontology-library-ui", "dist");

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

    ZoteroReplicaPanel.currentPanel = new ZoteroReplicaPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.buildHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
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

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    html = html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`);

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
