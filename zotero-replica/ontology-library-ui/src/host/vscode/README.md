# VS Code host adapter (Phase H)

This directory will hold the VS Code-specific adapter for the Library UI:
a `Transport` implementation that proxies `api/*` calls through
`postMessage` to the extension host (mirroring
`ontology-vscode-extension/webview-src/services/apiClient.ts`'s VS Code
proxy mode), plus any `acquireVsCodeApi()` bootstrapping.

Nothing under `src/core` or `src/api` should ever import from this
directory's sibling — only `src/main.tsx` (or a small host-selection entry
point added in Phase H) should choose which transport to install via
`setTransport()` in `src/api/client.ts`.

Intentionally empty until Phase H (VS Code webview integration).