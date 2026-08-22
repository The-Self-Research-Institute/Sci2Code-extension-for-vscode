import * as vscode from "vscode";
import { ReplicaAuthSession } from "./authSession";
import { ReplicaApiKeySession } from "./apiKeySession";
import { dataserverRequest } from "./dataserverClient";

/**
 * Sci2Code's Zotero-free data source: reads items from the Replica
 * dataserver using a Replica API key (see apiKeySession.ts) - a credential
 * generated from within the Replica webview's "API Access" panel
 * (POST /auth/api-key) and connected here via "Zotero Replica: Login with
 * API Key". This is DELIBERATELY separate from the Replica webview's own
 * login JWT (see authSession.ts): the JWT authenticates the webview/app
 * itself, the API key authenticates external clients like Sci2Code, exactly
 * as a real Zotero API key never was the same thing as a Zotero account
 * session.
 *
 * Deliberately returns items in the exact `{key, version, library, data}`
 * envelope the dataserver already uses (matching Zotero's own real API
 * shape by design - see the dataserver's ItemResponseMapper) rather than a
 * new type: every existing Sci2Code consumer (getZoteroItemTitle,
 * insertCitationCommand, bibliographyService, the Sci2CodeAPI export in
 * extension.ts) already reads items structurally via `.data.title`,
 * `.data.creators`, `.library.id`, etc. and needs no changes to accept these.
 */
export class ReplicaNotAuthenticatedError extends Error {}
export class ReplicaApiKeyInvalidError extends Error {}

export async function fetchReplicaLibraryItems(context: vscode.ExtensionContext): Promise<any[]> {
  const session = new ReplicaApiKeySession(context.secrets);
  const apiKey = await session.getApiKey();
  const userId = await session.getUserId();

  if (!apiKey || !userId) {
    throw new ReplicaNotAuthenticatedError(
      "Not connected to Zotero Replica. Run \"Zotero Replica: Login with API Key\" first."
    );
  }

  const result = await dataserverRequest<any[]>("GET", `/users/${userId}/items`, {
    token: apiKey,
    params: { limit: 100 },
  });

  if (!result.ok) {
    if (result.status === 401) {
      throw new ReplicaApiKeyInvalidError(
        "Your Replica API key was rejected - it may have been revoked or regenerated. Run \"Zotero Replica: Login with API Key\" again with a fresh key."
      );
    }
    throw new Error(`Failed to fetch items from the Zotero Replica (status ${result.status}).`);
  }
  return result.data ?? [];
}

/**
 * Validates a pasted Replica API key against the dataserver (GET /auth/whoami,
 * which resolves identity from the key itself - see AuthController.java) and,
 * on success, persists it alongside the userId it resolved to. The user is
 * never asked to supply that userId manually.
 */
export async function loginWithReplicaApiKey(
  context: vscode.ExtensionContext,
  rawApiKey: string
): Promise<{ userId: string; email: string }> {
  const trimmed = rawApiKey.trim();
  if (!trimmed) {
    throw new ReplicaApiKeyInvalidError("An API key is required.");
  }

  const result = await dataserverRequest<{ userId: string; email: string }>("GET", "/auth/whoami", {
    token: trimmed,
  });

  if (!result.ok || !result.data?.userId) {
    throw new ReplicaApiKeyInvalidError(
      "That API key was rejected by the Replica dataserver. Generate a fresh one from \"Zotero Replica: Open Library\" -> API Access, then try again."
    );
  }

  await new ReplicaApiKeySession(context.secrets).setCredentials(trimmed, result.data.userId);
  return result.data;
}

export async function isReplicaApiKeyConfigured(context: vscode.ExtensionContext): Promise<boolean> {
  return new ReplicaApiKeySession(context.secrets).isConfigured();
}

/** Disconnects Sci2Code from Replica (clears the API key only) - does NOT touch the Replica webview's own login session. */
export async function disconnectReplicaApiKey(context: vscode.ExtensionContext): Promise<void> {
  await new ReplicaApiKeySession(context.secrets).clear();
}

/** Logs the Replica WEBVIEW itself out (clears the login JWT) - unrelated to Sci2Code's API-key connection above. Used by the "Zotero Replica: Logout" command. */
export async function logoutOfReplica(context: vscode.ExtensionContext): Promise<void> {
  await new ReplicaAuthSession(context.secrets).clear();
}
