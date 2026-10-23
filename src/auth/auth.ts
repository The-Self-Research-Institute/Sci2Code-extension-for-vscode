import { authentication, window, commands, ProgressLocation } from "vscode";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import {
  getUserDetails,
  getAllZoteroItems,
  getZoteroCollectionList,
} from "../zotero/api";
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

      const userId = zoteroUserDetailsRes.userID;
      const library = await window.withProgress(
        {
          location: ProgressLocation.Window,
          title: "Sci2Code: Loading Zotero library",
        },
        (progress) =>
          getAllZoteroItems(userId, session.accessToken, {
            onProgress: (loaded, total) =>
              progress.report({
                message: total ? `${loaded}/${total}` : `${loaded}`,
              }),
          })
      );
      console.log(
        '[Sci2Code] Library fetched, item count:',
        library.items.length,
        'of',
        library.total ?? 'unknown'
      );

      contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, library.items);

      if (!library.complete) {
        window.showWarningMessage(
          `Sci2Code: Your Zotero library was only partly loaded. ${library.error ?? ""} Use "Refresh Library" to try again.`
        );
      }

      try {
        contextService.setContext(
          ZOTERO_CONTEXT.ZOTERO_COLLECTIONS,
          (await getZoteroCollectionList(userId, session.accessToken)).items
        );
      } catch (e) {
        console.error('[Sci2Code] Failed to fetch collection list:', e);
        contextService.setContext(ZOTERO_CONTEXT.ZOTERO_COLLECTIONS, []);
      }

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
    // Clear the invalid session
    contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, false);
    contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, []);
    return { isSessionGenerated: false };
  }
};
