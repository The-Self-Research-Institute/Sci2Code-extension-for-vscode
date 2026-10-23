import * as vscode from "vscode";

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

const ICON_REFRESH = icon(
  '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'
);
const ICON_SLIDERS = icon(
  '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'
);
const ICON_LOGOUT = icon(
  '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
);
const ICON_SEARCH = icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>');
const ICON_PLUS = icon('<path d="M5 12h14"/><path d="M12 5v14"/>');
const ICON_CLOSE = icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
const ICON_PREV = icon('<path d="m15 18-6-6 6-6"/>');
const ICON_NEXT = icon('<path d="m9 18 6-6-6-6"/>');
const ICON_CHEVRON = icon('<path d="m6 9 6 6 6-6"/>');
const ICON_FILE_CODE = icon(
  '<path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m5 12-3 3 3 3"/><path d="m9 18 3-3-3-3"/>'
);
const ICON_LIST = icon(
  '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>'
);

export function getPanelHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string
): string {
  const asset = (file: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "resources", "panel", file));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${asset("panel.css")}">
</head>
<body>
<div class="center hidden" id="loggedOut">
  <p>Connect your Zotero account to browse and cite your library.</p>
  <button class="btn" id="login">Login to Zotero</button>
  <p class="hint">You need a Zotero API key. Get one from <a id="keysLink" href="https://www.zotero.org/settings/keys">zotero.org/settings/keys</a>.</p>
</div>

<aside class="extension hidden" id="main" aria-label="Sci2Code citation sidebar">
  <header class="head">
    <span class="brand">SCI2CODE</span>
    <div class="tools">
      <button class="icon" id="manual" aria-label="Add manual citation" title="Add manual citation">${ICON_PLUS}</button>
      <button class="icon" id="settings" aria-label="Filter by collection or tag" title="Filter by collection or tag" aria-pressed="false">${ICON_SLIDERS}<span class="badge-dot hidden" id="filterDot"></span></button>
      <button class="icon" id="logout" aria-label="Log out of Zotero" title="Log out of Zotero">${ICON_LOGOUT}</button>
    </div>
  </header>
  <div class="connection">
    <span class="dot" id="dot"></span><span>Zotero &middot; <span class="account" id="account"></span></span>
    <span class="synced"><span id="synced"></span><button class="icon small" id="refresh" aria-label="Sync library now" title="Sync library now">${ICON_REFRESH}</button></span>
  </div>
  <div class="search">
    ${ICON_SEARCH}
    <input id="search" type="text" aria-label="Search references" placeholder="Search title, author, DOI..." autocomplete="off" spellcheck="false">
    <span class="kbd" id="kbd" aria-hidden="true"></span>
    <button class="icon small hidden" id="clearSearch" aria-label="Clear search" title="Clear search">${ICON_CLOSE}</button>
  </div>

  <div class="form filters" id="options" hidden>
    <label for="collection">Collection</label>
    <select id="collection"></select>
    <label for="tag">Tag</label>
    <select id="tag"></select>
    <button class="linklike" id="clearFilters">Clear filters</button>
  </div>

  <div class="tabs" role="tablist" aria-label="Reference scope">
    <button role="tab" id="tabLibrary" data-tab="library" aria-selected="true">Library <span class="count" id="libCount">0</span></button>
    <button role="tab" id="tabCited" data-tab="cited" aria-selected="false">Cited in file <span class="count" id="citedCount">0</span></button>
  </div>
  <div class="list-meta">
    <span id="refCount"></span>
    <select id="sort" aria-label="Sort references">
      <option value="year">Year &middot; newest</option>
      <option value="title">Title &middot; A&ndash;Z</option>
      <option value="author">Author &middot; A&ndash;Z</option>
      <option value="type">Type</option>
    </select>
  </div>
  <div class="list" id="list" role="list"></div>
  <nav class="pager hidden" id="pager" aria-label="Pagination">
    <button class="icon" id="prevPage" aria-label="Previous page" title="Previous page">${ICON_PREV}</button>
    <span id="pageInfo" aria-live="polite"></span>
    <button class="icon" id="nextPage" aria-label="Next page" title="Next page">${ICON_NEXT}</button>
  </nav>

  <section class="preview" id="preview" aria-label="Reference details" hidden>
    <div class="preview-head"><span class="eyebrow">Reference details</span><span class="format" id="pvFormat"></span><button class="icon" id="closePreview" aria-label="Close reference details">${ICON_CLOSE}</button></div>
    <h3 id="pvTitle"></h3>
    <p class="authors" id="pvAuthors"></p>
    <p class="identifier" id="pvId"></p>
    <div class="links"><button id="addToZotero">Add to Zotero</button><button id="open">Open in Zotero</button><button id="copyKey">Copy key</button><button id="copyDoi">Copy DOI</button></div>
    <details id="pvDetails"><summary>Preview citation</summary><pre id="pvCode"></pre></details>
  </section>

  <div class="quick-status">
    <button class="chip" id="target" title="Edit citation template for this language">${ICON_FILE_CODE}<span id="targetText"></span></button>
    <div class="feedback" id="feedback" aria-live="polite"></div>
  </div>
  <footer class="footer">
    <div class="split">
      <button class="main-action" id="bibliography" title="Choose style and destination">${ICON_LIST}Generate bibliography</button>
      <button class="icon small" id="bibMenuButton" aria-haspopup="menu" aria-expanded="false" aria-label="More bibliography options" title="More options">${ICON_CHEVRON}</button>
      <div class="menu hidden" id="bibMenu" role="menu">
        <button role="menuitem" data-scope="file" data-output="cursor">Insert at cursor</button>
        <button role="menuitem" data-scope="file" data-output="clipboard">Copy to clipboard</button>
        <button role="menuitem" data-scope="file" data-output="file">Write to file</button>
        <button role="menuitem" data-scope="workspace" data-output="">Whole workspace&hellip;</button>
      </div>
    </div>
    <span class="right" id="bibScope"></span>
  </footer>
</aside>
<script nonce="${nonce}" src="${asset("panel.js")}"></script>
</body>
</html>`;
}
