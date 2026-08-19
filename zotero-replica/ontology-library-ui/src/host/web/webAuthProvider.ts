import type { AuthProvider, AuthStatus } from '../../api/authProvider';
import { decodeJwtPayload, isTokenExpired, ownerIdFromToken } from '../../core/state/auth';

/** Reads the JWT that LoginForm stores after a successful /auth/login or /auth/register call. */
export class WebAuthProvider implements AuthProvider {
  async getStatus(): Promise<AuthStatus> {
    let token: string | null = null;
    try {
      token = window.localStorage.getItem('authToken');
    } catch {
      /* non-browser host */
    }
    if (!token || isTokenExpired(token)) return { available: false };
    const decoded = decodeJwtPayload(token);
    if (!decoded) return { available: false };
    return { available: true, userId: ownerIdFromToken(decoded), email: decoded.email };
  }
}
