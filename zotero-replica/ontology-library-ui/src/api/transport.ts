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

export interface ResponseWithVersion<T> {
  data: T;
  /** The `Last-Modified-Version` header (the LIBRARY's version, not an item's) - stamped on every dataserver response by LibraryVersionHeaderInterceptor. Null if the endpoint didn't resolve a library (e.g. auth routes). */
  libraryVersion: number | null;
  /** The `Total-Results` header (PaginationUtil) - the full matching count behind a paginated list endpoint, regardless of `limit`. Null on non-paginated endpoints. */
  totalResults: number | null;
}

export interface UploadFileInput {
  filename: string;
  contentType: string;
  /** Raw base64 payload - no "data:...;base64," prefix. */
  base64Data: string;
}

export interface BinaryDownloadResult {
  base64: string;
  contentType: string;
  filename: string;
}

export interface Transport {
  request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options?: RequestOptions): Promise<T>;
  /** Same as request(), but also surfaces the library-version header - needed for version-guarded operations that act on the whole library (e.g. tag rename) rather than one item/collection. */
  requestWithVersion<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options?: RequestOptions,
  ): Promise<ResponseWithVersion<T>>;
  /**
   * Multipart file upload (AttachmentController's `@RequestParam("file") MultipartFile`).
   * Separate from request() because the body is binary, not JSON - the VS
   * Code host must proxy raw bytes through the extension host exactly like
   * every other call (the webview never talks to the network directly).
   */
  uploadFile(path: string, file: UploadFileInput, options?: RequestOptions): Promise<{ libraryVersion: number | null }>;
  /** Binary file download (AttachmentController's GET .../file) - resolves base64 bytes rather than streaming, matching the postMessage bridge's JSON-message shape. */
  downloadBinary(path: string, options?: RequestOptions): Promise<BinaryDownloadResult>;
}