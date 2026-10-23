import { authentication, window, commands, ProgressLocation } from "vscode";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import {
  ZoteroApiError,
  getUserDetails,
  getAllZoteroItems,
  getItemsSince,
  getDeletedSince,
  getLibraryVersion,
  getZoteroCollectionList,
} from "../zotero/api";
import { applyDelta } from "../zotero/delta";
import { ZOTERO_CONTEXT } from "../system/constants";
import { contextService } from "../services/contextService";
import { libraryCache } from "../services/libraryCache";

class AuthFailure extends Error {}

const isAuthFailure = (e: unknown) =>
  e instanceof AuthFailure ||
  (e instanceof ZoteroApiError &&
    (e.status === 401 || e.status === 403 || e.status === 404));

interface SyncResult {
  items: any[];
  version: number;
  complete: boolean;
  unchanged: boolean;
  error?: string;
  total?: number;
}

async function syncLibrary(
  userId: string,
  apiKey: string,
  onProgress?: (loaded: number, total: number | undefined) => void
): Promise<SyncResult> {
  const streamPages = (contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || []).length === 0;
  const current: any[] = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || [];
  const knownVersion: number = contextService.getContext(ZOTERO_CONTEXT.LIBRARY_VERSION) || 0;

  if (knownVersion > 0 && current.length > 0) {
    try {
      const latest = await getLibraryVersion(userId, apiKey);
      if (latest === knownVersion) {
        return { items: current, version: latest, complete: true, unchanged: true };
      }
      const [changed, deleted] = await Promise.all([
        getItemsSince(userId, apiKey, knownVersion, { onProgress }),
        getDeletedSince(userId, apiKey, knownVersion),
      ]);
      if (changed.complete) {
        return {
          items: applyDelta(current, changed.items, deleted.items),
          version: changed.version ?? latest,
          complete: true,
          unchanged: false,
        };
      }
    } catch (e) {
      if (isAuthFailure(e)) {
        throw e;
      }
      console.error("[Sci2Code] Incremental sync failed, doing a full sync:", e);
    }
  }

  const full = await getAllZoteroItems(userId, apiKey, {
    onProgress: (loaded, total) => {
      contextService.setContext(ZOTERO_CONTEXT.LOAD_PROGRESS, { loaded, total: total ?? loaded });
      onProgress?.(loaded, total);
    },
    onPage: streamPages
      ? (items) => contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, items)
      : undefined,
  });
  return {
    items: full.items,
    version: full.version ?? 0,
    complete: full.complete,
    unchanged: false,
    error: full.error,
    total: full.total,
  };
}

let inFlight: Promise<{ isSessionGenerated: boolean }> | undefined;

export const generateSession = (
  createIfNone: boolean,
  forceNewSession: boolean = false,
  background: boolean = false
) => {
  if (inFlight) {
    return inFlight;
  }
  inFlight = runSession(createIfNone, forceNewSession, background).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
};

async function runSession(
  createIfNone: boolean,
  forceNewSession: boolean,
  background: boolean
): Promise<{ isSessionGenerated: boolean }> {
  const session = await authentication.getSession(
    ZoteroAuthenticationProvider.id,
    [],
    forceNewSession ? { forceNewSession: true } : { createIfNone }
  );

  try {
    if (session) {
      if (!background) {
        await contextService.setContext(ZOTERO_CONTEXT.AUTHENTICATING, true);
      }
      const zoteroUserDetailsReq = await getUserDetails(session.accessToken);

      if (!zoteroUserDetailsReq.ok) {
        const status = zoteroUserDetailsReq.status;
        const errorMsg = status === 403 || status === 401
          ? "Invalid API key. Please check your Zotero API key and ensure it has the correct permissions."
          : `Failed to connect to Zotero API (${status}): ${zoteroUserDetailsReq.statusText}`;
        console.error('[Sci2Code] API validation failed:', errorMsg);
        throw status === 403 || status === 401
          ? new AuthFailure(errorMsg)
          : new Error(errorMsg);
      }

      const zoteroUserDetailsRes = (await zoteroUserDetailsReq.json()) as {
        username: string;
        userID: string;
      };

      const userId = String(zoteroUserDetailsRes.userID);
      const username = zoteroUserDetailsRes.username;
      const previousUserId = contextService.getContext(ZOTERO_CONTEXT.USERID);
      if (forceNewSession || (previousUserId && String(previousUserId) !== userId)) {
        contextService.setContext(ZOTERO_CONTEXT.LIBRARY_VERSION, 0);
        if (previousUserId && String(previousUserId) !== userId) {
          contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, []);
          contextService.setContext(ZOTERO_CONTEXT.ZOTERO_COLLECTIONS, []);
        }
      }
      contextService.setContext(ZOTERO_CONTEXT.USERNAME, username);
      contextService.setContext(ZOTERO_CONTEXT.USERID, userId);
      contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, true);

      const library = background
        ? await syncLibrary(userId, session.accessToken)
        : await window.withProgress(
            {
              location: ProgressLocation.Window,
              title: "Sci2Code: Syncing Zotero library",
            },
            (progress) =>
              syncLibrary(userId, session.accessToken, (loaded, total) =>
                progress.report({
                  message: total ? `${loaded}/${total}` : `${loaded}`,
                })
              )
          );
      console.log(
        '[Sci2Code] Library synced, item count:',
        library.items.length,
        library.unchanged ? '(unchanged)' : ''
      );

      let collections: any[] | undefined;
      if (!library.unchanged) {
        try {
          collections = (await getZoteroCollectionList(userId, session.accessToken)).items;
        } catch (e) {
          console.error('[Sci2Code] Failed to fetch collection list:', e);
        }
      }

      if (!library.unchanged) {
        contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, library.items);
      }
      if (collections) {
        contextService.setContext(ZOTERO_CONTEXT.ZOTERO_COLLECTIONS, collections);
      } else if (!contextService.getContext(ZOTERO_CONTEXT.ZOTERO_COLLECTIONS)) {
        contextService.setContext(ZOTERO_CONTEXT.ZOTERO_COLLECTIONS, []);
      }

      const syncedAt = Date.now();
      contextService.setContext(ZOTERO_CONTEXT.LAST_SYNCED, syncedAt);
      contextService.setContext(ZOTERO_CONTEXT.CACHED, false);
      contextService.setContext(ZOTERO_CONTEXT.OFFLINE, false);
      if (library.version > 0) {
        contextService.setContext(ZOTERO_CONTEXT.LIBRARY_VERSION, library.version);
      }

      if (library.complete) {
        if (!library.unchanged) {
          void libraryCache.save({
            userId,
            username,
            syncedAt,
            libraryVersion: library.version,
            items: library.items,
            collections:
              collections ?? contextService.getContext(ZOTERO_CONTEXT.ZOTERO_COLLECTIONS) ?? [],
          });
        }
      } else {
        contextService.setContext(ZOTERO_CONTEXT.LIBRARY_VERSION, 0);
        window.showWarningMessage(
          `Sci2Code: Your Zotero library was only partly loaded. ${library.error ?? ""} Use the sync button to try again.`
        );
      }

      if (createIfNone || forceNewSession) {
        window.showInformationMessage(`Zotero connected as ${username}.`);
      }
    } else {
      console.log('[Sci2Code] No session available');
    }

    return { isSessionGenerated: true };
  } catch (e) {
    const cachedItems: any[] = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || [];
    const hasLibrary = cachedItems.length > 0;

    if (!isAuthFailure(e) && hasLibrary) {
      console.error('[Sci2Code] Sync failed, keeping the current library:', e);
      const wasOffline = contextService.getContext(ZOTERO_CONTEXT.OFFLINE) === true;
      contextService.setContext(ZOTERO_CONTEXT.OFFLINE, true);
      if (!background || !wasOffline) {
        window.showWarningMessage(
          "Sci2Code: Could not reach Zotero. Showing your last synced library."
        );
      }
      return { isSessionGenerated: false };
    }

    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    window.showErrorMessage(
      `Failed to connect to Zotero: ${errorMessage}\n\nPlease verify your API key has read/write access and is correctly configured. Run "Sci2Code: Show Logs" for more details.`,
      'Show Logs'
    ).then(selection => {
      if (selection === 'Show Logs') {
        commands.executeCommand('sci2code.showLogs');
      }
    });
    contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, false);
    contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, []);
    contextService.setContext(ZOTERO_CONTEXT.CACHED, false);
    contextService.setContext(ZOTERO_CONTEXT.LIBRARY_VERSION, 0);
    if (isAuthFailure(e)) {
      void libraryCache.clear();
    }
    return { isSessionGenerated: false };
  } finally {
    contextService.setContext(ZOTERO_CONTEXT.LOAD_PROGRESS, null);
    await contextService.setContext(ZOTERO_CONTEXT.AUTHENTICATING, false);
  }
}
