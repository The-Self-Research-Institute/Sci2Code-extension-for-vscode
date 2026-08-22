import * as vscode from "vscode";

/**
 * Node-side HTTP client for the Replica dataserver, used only by the
 * extension host (never the webview - see webviewPanel.ts's message
 * handling). Running requests here rather than in the webview means the
 * webview's CSP never needs a `connect-src` grant at all; it stays
 * `default-src 'none'` and simply never talks to the network directly.
 */
export function getDataserverBaseUrl(): string {
  const configured = vscode.workspace.getConfiguration("sci2code").get<string>("replicaDataserverUrl");
  return (configured && configured.trim()) || "http://localhost:9089";
}

export interface DataserverRequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  token?: string;
}

export interface DataserverResult<T> {
  ok: boolean;
  status: number;
  data: T | undefined;
  /** The `Last-Modified-Version` response header (the library's version) - null when the endpoint didn't resolve a library (e.g. auth routes). */
  libraryVersion: number | null;
  /** The `Total-Results` response header (PaginationUtil) - null on non-paginated endpoints. */
  totalResults: number | null;
}

function buildUrl(path: string, params?: DataserverRequestOptions["params"]): string {
  const url = new URL(path, getDataserverBaseUrl());
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function dataserverRequest<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: DataserverRequestOptions = {}
): Promise<DataserverResult<T>> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const hasBody = options.body !== undefined;
  if (hasBody && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const response = await fetch(buildUrl(path, options.params), {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  let data: T | undefined;
  try {
    data = response.status === 204 ? undefined : ((await response.json()) as T);
  } catch {
    data = undefined;
  }

  const rawVersion = response.headers.get("Last-Modified-Version");
  const libraryVersion = rawVersion !== null && rawVersion !== "" ? Number(rawVersion) : null;
  const rawTotal = response.headers.get("Total-Results");
  const totalResults = rawTotal !== null && rawTotal !== "" ? Number(rawTotal) : null;

  return { ok: response.ok, status: response.status, data, libraryVersion, totalResults };
}

export interface UploadFileOptions {
  filename: string;
  contentType: string;
  /** Raw base64 payload - no "data:...;base64," prefix. Decoded here, in the extension host, so the webview never touches Node Buffers. */
  base64Data: string;
  token?: string;
  ifUnmodifiedSinceVersion?: number;
}

export interface UploadFileResult {
  ok: boolean;
  status: number;
  errorMessage?: string;
  libraryVersion: number | null;
}

/**
 * Multipart upload for AttachmentController's `@RequestParam("file") MultipartFile`.
 * Kept separate from dataserverRequest() because the body is binary
 * (multipart/form-data), not JSON - VS Code's global fetch/FormData/Blob
 * (Node 18+) build the multipart body exactly like a browser would.
 */
export async function dataserverUploadFile(path: string, options: UploadFileOptions): Promise<UploadFileResult> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.ifUnmodifiedSinceVersion !== undefined) {
    headers["If-Unmodified-Since-Version"] = String(options.ifUnmodifiedSinceVersion);
  }

  const buffer = Buffer.from(options.base64Data, "base64");
  const blob = new Blob([buffer], { type: options.contentType });
  const form = new FormData();
  form.append("file", blob, options.filename);

  const response = await fetch(buildUrl(path), { method: "POST", headers, body: form });

  let errorMessage: string | undefined;
  if (!response.ok) {
    try {
      const data = (await response.json()) as { message?: string };
      errorMessage = data?.message;
    } catch {
      /* no JSON body on this error response */
    }
  }

  const rawVersion = response.headers.get("Last-Modified-Version");
  const libraryVersion = rawVersion !== null && rawVersion !== "" ? Number(rawVersion) : null;

  return { ok: response.ok, status: response.status, errorMessage, libraryVersion };
}

export interface DownloadFileResult {
  ok: boolean;
  status: number;
  errorMessage?: string;
  base64?: string;
  contentType?: string;
  filename?: string;
}

function filenameFromContentDisposition(headerValue: string | null): string {
  if (!headerValue) {
    return "download";
  }
  const match = /filename="?([^";]+)"?/.exec(headerValue);
  return match ? match[1] : "download";
}

/**
 * Streams AttachmentController's GET .../file download and resolves it as
 * base64 - the postMessage bridge to the webview only carries JSON-safe
 * messages, so bytes are never streamed directly to the webview.
 */
export async function dataserverDownloadFile(
  path: string,
  options: { token?: string }
): Promise<DownloadFileResult> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(buildUrl(path), { method: "GET", headers });

  if (!response.ok) {
    let errorMessage: string | undefined;
    try {
      const data = (await response.json()) as { message?: string };
      errorMessage = data?.message;
    } catch {
      /* no JSON body on this error response */
    }
    return { ok: false, status: response.status, errorMessage };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    ok: true,
    status: response.status,
    base64: buffer.toString("base64"),
    contentType: response.headers.get("Content-Type") ?? "application/octet-stream",
    filename: filenameFromContentDisposition(response.headers.get("Content-Disposition")),
  };
}
