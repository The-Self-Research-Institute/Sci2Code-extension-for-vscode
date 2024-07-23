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
        throw new Error(zoteroUserDetailsReq.statusText);
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
        throw new Error(zoteroUserDetailsReq.statusText);
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
    window.showErrorMessage(
      "Failed to connect to zotero. You need to use a API KEY that has access to your zotero account. Please sign out and try again."
    );
    return { isSessionGenerated: true };
  }
};
