import { authentication, window } from "vscode";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import { getUserDetails, getZoteroCollections } from "../zotero/api";
import { ZOTERO_CONTEXT } from "../system/constants";
import { contextService } from "../services/contextService";
import { SidebarProvider } from "../providers/sidebarProvider";

export const generateSession = async (createIfNone: boolean) => {
  const sidebarProvider = new SidebarProvider();

  const session = await authentication.getSession(
    ZoteroAuthenticationProvider.id,
    [],
    { createIfNone }
  );

  try {
    if (session) {
      const zoteroUserDetailsReq = await getUserDetails(session.accessToken);

      if (!zoteroUserDetailsReq.ok) {
        const errorMsg = zoteroUserDetailsReq.status === 403
          ? "Invalid API key. Please check your Zotero API key and ensure it has the correct permissions."
          : `Failed to connect to Zotero API: ${zoteroUserDetailsReq.statusText}`;
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
        throw new Error(`Failed to fetch Zotero items: ${zoteroCollections.statusText}`);
      }

      const zoteroCollectionsRes = await zoteroCollections.json();

      contextService.setContext(
        ZOTERO_CONTEXT.ZOTERO_ITEMS,
        zoteroCollectionsRes
      );

      sidebarProvider.refresh();

      window.showInformationMessage(
        `Zotero Connected Successfully.\n Hello ${zoteroUserDetailsRes.username}.\n userId: ${zoteroUserDetailsRes.userID}`
      );
    }

    return { isSessionGenerated: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    window.showErrorMessage(
      `Failed to connect to Zotero: ${errorMessage}\n\nPlease verify your API key has read/write access and is correctly configured.`
    );
    // Clear the invalid session
    contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, false);
    contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, []);
    return { isSessionGenerated: false };
  }
};
