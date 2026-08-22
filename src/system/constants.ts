export const ZOTERO_CONTEXT_PREFIX = "zotero:";

export const ZOTERO_CONTEXT = {
  INITIALIZED: "initialized", // default to loading state (notLoading = false when boolean is initialized)
  LOGGEDIN: "loggedIn",
  USERNAME: "username",
  USERID: "userId",
  ZOTERO_ITEMS: "zoteroItems",
  // Which path last populated ZOTERO_ITEMS ("zotero" | "replica") - lets the
  // legacy Zotero auth/logout/config-change handlers avoid wiping out items
  // that actually came from the Zotero Replica sync, and lets citation
  // insertion skip the legacy saveMetadataToZotero side effect for Replica
  // items. See src/zoteroReplica/replicaLibraryClient.ts and
  // src/features/insertCitationCommand.ts.
  ITEMS_SOURCE: "itemsSource",
  AUTHENTICATING: "authenticating",
  CODE_ENABLED: "codeEnabled",
  CODE_LOCAL_ENGINE_ENABLED: "codeLocalEngineEnabled",
  WORKSPACE_FOUND: "workspaceFound",
  ERROR: "error",
  MODE: "mode",
  ADVANCED: "advanced",
  DELTA_FINDINGS_ENABLED: "deltaFindingsEnabled",
};
