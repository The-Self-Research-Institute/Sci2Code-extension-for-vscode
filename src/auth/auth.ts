import { authentication, window, commands } from "vscode";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import { getUserDetails, getZoteroCollections } from "../zotero/api";
import { ZOTERO_CONTEXT } from "../system/constants";
import { contextService } from "../services/contextService";
import { SidebarProvider } from "../providers/sidebarProvider";

export const generateSession = async (
  createIfNone: boolean,
  forceNewSession: boolean = false
) => {
  const sidebarProvider = new SidebarProvider();

  const session = await authentication.getSession(
    ZoteroAuthenticationProvider.id,
    [],
    forceNewSession ? { forceNewSession: true } : { createIfNone }
  );

  try {
    if (session) {
      const zoteroUserDetailsReq = await getUserDetails(session.accessToken);

      if (!zoteroUserDetailsReq.ok) {
        const errorMsg = zoteroUserDetailsReq.status === 403
          ? "Invalid API key. Please check your Zotero API key and ensure it has the correct permissions."
          : `Failed to connect to Zotero API (${zoteroUserDetailsReq.status}): ${zoteroUserDetailsReq.statusText}`;
        console.error('[Sci2Code] API validation failed:', errorMsg);
        throw new Error(errorMsg);
      }

      const zoteroUserDetailsRes = (await zoteroUserDetailsReq.json()) as {
        username: string;
        userID: string;
      };

      contextService.setContext(
        ZOTERO_CONTEXT.USERNAME,
        zoteroUserDetailsRes.username
      );

      contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, true);

      const zoteroCollections = await getZoteroCollections(
        zoteroUserDetailsRes.userID,
        session.accessToken
      );

      if (!zoteroCollections.ok) {
        console.error('[Sci2Code] Failed to fetch collections:', zoteroCollections.statusText);
        throw new Error(`Failed to fetch Zotero items: ${zoteroCollections.statusText}`);
      }

      const zoteroCollectionsRes = await zoteroCollections.json();
      const itemCount = Array.isArray(zoteroCollectionsRes) ? zoteroCollectionsRes.length : 'unknown';
      console.log('[Sci2Code] Collections fetched, item count:', itemCount);

      contextService.setContext(
        ZOTERO_CONTEXT.ZOTERO_ITEMS,
        zoteroCollectionsRes
      );
      contextService.setContext(ZOTERO_CONTEXT.ITEMS_SOURCE, "zotero");

      sidebarProvider.refresh();

      window.showInformationMessage(
        `Zotero Connected Successfully.\n Hello ${zoteroUserDetailsRes.username}.\n userId: ${zoteroUserDetailsRes.userID}`
      );
    } else {
      console.log('[Sci2Code] No session available');
    }

    return { isSessionGenerated: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    window.showErrorMessage(
      `Failed to connect to Zotero: ${errorMessage}\n\nPlease verify your API key has read/write access and is correctly configured. Run "Sci2Code: Show Logs" for more details.`,
      'Show Logs'
    ).then(selection => {
      if (selection === 'Show Logs') {
        commands.executeCommand('sci2code.showLogs');
      }
    });
    // Clear the invalid session - but only wipe ZOTERO_ITEMS/LOGGEDIN if
    // they're currently populated FROM this legacy Zotero path, not from a
    // Zotero Replica sync (see ZOTERO_CONTEXT.ITEMS_SOURCE's doc comment).
    if (contextService.getContext(ZOTERO_CONTEXT.ITEMS_SOURCE) !== "replica") {
      contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, false);
      contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, []);
    }
    return { isSessionGenerated: false };
  }
};
