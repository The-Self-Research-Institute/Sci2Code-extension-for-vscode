/**
 * Host-agnostic auth-status seam, parallel to transport.ts's Transport
 * abstraction. Never carries the raw JWT itself across this interface - only
 * whether live mode is usable and which owner id to query as. The web host
 * decodes its own localStorage token; the VS Code host never sees the raw
 * token at all (the extension attaches it during the request relay).
 */
export interface AuthStatus {
  available: boolean;
  userId?: string;
  email?: string;
}

export interface AuthProvider {
  getStatus(): Promise<AuthStatus>;
  /** Clears the persisted session - the only path that ends it (see the persistent-session requirement). */
  logout(): Promise<void>;
}

class UnauthenticatedProvider implements AuthProvider {
  async getStatus(): Promise<AuthStatus> {
    return { available: false };
  }
  async logout(): Promise<void> {}
}

let provider: AuthProvider = new UnauthenticatedProvider();

export function setAuthProvider(next: AuthProvider): void {
  provider = next;
}

export function getAuthStatus(): Promise<AuthStatus> {
  return provider.getStatus();
}

export function logout(): Promise<void> {
  return provider.logout();
}
