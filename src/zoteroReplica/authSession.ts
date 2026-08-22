import * as vscode from "vscode";

/**
 * Persistent Replica authentication session for the extension host, backed
 * by VS Code's SecretStorage (OS keychain-encrypted, survives webview
 * reload/close, VS Code restart, and machine restart - unlike localStorage
 * inside the webview, which this replaces as the source of truth). Mirrors
 * the same SecretStorage pattern already used by ZoteroAuthenticationProvider
 * (see src/providers/authProvider.ts), but does not implement the
 * vscode.AuthenticationProvider interface - the Replica has no equivalent of
 * VS Code's Accounts-menu "sign in with a provider" flow, just a token
 * issued by our own dataserver.
 */
const TOKEN_KEY = "zoteroReplica.authToken";

export interface ReplicaJwtPayload {
  email?: string;
  userId?: string;
  sub?: string;
  exp?: number;
}

function decodeJwtPayload(token: string): ReplicaJwtPayload | null {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isExpired(payload: ReplicaJwtPayload): boolean {
  if (!payload.exp) return true;
  return Date.now() >= payload.exp * 1000;
}

/** True once the token is within this window of expiring - the cue to proactively refresh. */
export function isNearExpiry(payload: ReplicaJwtPayload, windowMs = 3 * 24 * 60 * 60 * 1000): boolean {
  if (!payload.exp) return true;
  return payload.exp * 1000 - Date.now() < windowMs;
}

export class ReplicaAuthSession {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getToken(): Promise<string | undefined> {
    return this.secrets.get(TOKEN_KEY);
  }

  async setToken(token: string): Promise<void> {
    await this.secrets.store(TOKEN_KEY, token);
  }

  async clear(): Promise<void> {
    await this.secrets.delete(TOKEN_KEY);
  }

  /** Decodes the currently stored token, if any - null if there is none or it's unreadable. */
  async getPayload(): Promise<ReplicaJwtPayload | null> {
    const token = await this.getToken();
    return token ? decodeJwtPayload(token) : null;
  }
}
