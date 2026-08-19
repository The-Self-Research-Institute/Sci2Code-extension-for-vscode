import { apiClient } from './client';

export interface AuthResponse {
  token: string;
  userId: string;
  email: string;
}

/** Calls the replica dataserver's own /auth/register - see AuthController.java. */
export function register(email: string, password: string): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/register', { email, password });
}

/** Calls the replica dataserver's own /auth/login - see AuthController.java. */
export function login(email: string, password: string): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/login', { email, password });
}
