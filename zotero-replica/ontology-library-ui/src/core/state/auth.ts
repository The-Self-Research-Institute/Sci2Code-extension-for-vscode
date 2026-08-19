export interface DecodedToken {
  userId?: string;
  email?: string;
  sub?: string;
  exp?: number;
  roles?: string[];
}

/** Client-side JWT payload decode - no signature verification (that's the server's job). */
export function decodeJwtPayload(token: string): DecodedToken | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const decoded = decodeJwtPayload(token);
  if (!decoded?.exp) return true;
  return Date.now() >= decoded.exp * 1000;
}

/** The owner id Dataserver's LibraryAccessResolver.requireSelf checks against. */
export function ownerIdFromToken(decoded: DecodedToken): string | undefined {
  return decoded.userId ?? decoded.email ?? decoded.sub;
}
