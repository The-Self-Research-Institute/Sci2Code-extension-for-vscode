import { apiClient } from './client';

export interface ApiKeyGenerateResponse {
  apiKey: string;
  createdAt: string;
}

export interface ApiKeyStatus {
  exists: boolean;
  createdAt?: string;
  lastUsedAt?: string;
}

/**
 * Calls the replica dataserver's own /auth/api-key endpoints (see
 * AuthController.java / ApiKeyService.java). This is a credential SEPARATE
 * from the login JWT this webview itself uses (see api/auth.ts) - it's the
 * one external clients such as Sci2Code authenticate with. Generating
 * revokes any previously issued key, matching the one-active-key-per-user
 * lifecycle the backend implements.
 */
export function generateApiKey(): Promise<ApiKeyGenerateResponse> {
  return apiClient.post<ApiKeyGenerateResponse>('/auth/api-key');
}

export function revokeApiKey(): Promise<void> {
  return apiClient.delete<void>('/auth/api-key', { expectEmptyBody: true });
}

export function getApiKeyStatus(): Promise<ApiKeyStatus> {
  return apiClient.get<ApiKeyStatus>('/auth/api-key');
}
