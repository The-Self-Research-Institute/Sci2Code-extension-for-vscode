import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  extractFileName,
  extractFunctionName,
  generateCodeId,
  getZoteroItemTitle,
  saveMetadataToZotero,
  formatCitationMetadata,
  getCitationDetail,
} from "../utils/zotero.utils";
import { renderTemplate } from "./templateService";

interface ZoteroQuickPickItem extends vscode.QuickPickItem {
  zoteroItem: any;
}

export async function insertCitationCommand(statusItem: vscode.StatusBarItem) {

  const zoteroItems = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);

  if (!zoteroItems || zoteroItems.length === 0) {
    const refreshLibrary = "Refresh Library";
    const openSettings = "Open Settings";
    const manualCitation = "Create Manual Citation";
    const result = await vscode.window.showErrorMessage(
      "No Zotero items found. This could mean:\n• Your Zotero library is empty\n• Your API key is not configured or invalid\n• The library hasn't been loaded yet",
      manualCitation,
      refreshLibrary,
      openSettings
    );

    if (result === refreshLibrary) {
      vscode.commands.executeCommand('zotero.refresh');
    } else if (result === openSettings) {
      vscode.commands.executeCommand('workbench.action.openSettings', 'sci2code.apiKey');
    } else if (result === manualCitation) {
      await insertManualCitationCommand();
    }
    return;
  }

  // --- Show Progress in Status Bar ---
  statusItem.text = '$(sync~spin) Searching Zotero...';

  // Add manual citation option at the top
  const quickPickItems: ZoteroQuickPickItem[] = [
    {
      label: "$(edit) Create Manual Citation",
      description: "Add a custom reference",
      detail: "Use this to add citations not in your Zotero library",
      zoteroItem: null as any, // Special marker for manual citation
    },
    ...zoteroItems.map((item: any) => {
      const title = getZoteroItemTitle(item);
      const metadata = formatCitationMetadata(item);
      const details = getCitationDetail(item);

      // Get item type icon
      const iconMap: Record<string, string> = {
        'journalArticle': 'book',
        'book': 'book',
        'bookSection': 'book',
        'conferencePaper': 'organization',
        'thesis': 'mortar-board',
        'manuscript': 'file-text',
        'webpage': 'globe',
        'report': 'file',
      };
      const icon = iconMap[item.data.itemType] || 'file-text';

      return {
        label: `$(${icon}) ${title}`,
        description: metadata,
        detail: details,
        zoteroItem: item,
      };
    }),
  ];

  const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
    placeHolder: "Search your Zotero library or create manual citation",
    matchOnDescription: true,
    matchOnDetail: true,
    ignoreFocusOut: true,
  });

  statusItem.text = '$(zap) Zotero: Ready'; // Reset status bar

  if (!selectedItem) {
    return;
  }

  // Check if user selected manual citation
  if (!selectedItem.zoteroItem) {
    await insertManualCitationCommand();
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const position = editor.selection.active;
  const fileName = extractFileName(document.fileName);

  let functionName: string | null = null;
  for (let i = position.line; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    functionName = extractFunctionName(lineText, "javascript"); // Assuming 'js' for now, should be language-aware
    if (functionName) break;
  }

  const codeId = generateCodeId(functionName || fileName, fileName);
  const titleOfItem = getZoteroItemTitle(selectedItem.zoteroItem);
  const languageId = editor.document.languageId;

  const snippet = renderTemplate(
    languageId,
    selectedItem.zoteroItem,
    { codeId, functionName }
  );

  if (snippet) {
    editor.insertSnippet(snippet);
    vscode.window.showInformationMessage(
      `Sci2Code: Inserted citation for "${titleOfItem}".`
    );
  } else {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't add citation: This file type isn't supported.`
    );
  }

  // Attaching the codeId back onto the source item is a LEGACY Zotero-only
  // feature (it PATCHes api.zotero.org - see saveMetadataToZotero/zotero/api.ts)
  // that never applies to Replica items: there is no equivalent write-back to
  // the Replica dataserver yet, and a Replica item's key/library.id would
  // mean nothing to the real Zotero API even if a legacy session happens to
  // be cached. Gating on ITEMS_SOURCE (set by zoteroReplica.syncToSci2Code /
  // auth/auth.ts) is the minimal authentication-scoped fix for the
  // cross-path coupling this caused - see ZOTERO_CONTEXT.ITEMS_SOURCE's doc
  // comment in system/constants.ts.
  if (contextService.getContext(ZOTERO_CONTEXT.ITEMS_SOURCE) !== "replica") {
    const userId = selectedItem.zoteroItem?.library?.id;
    const itemKey = selectedItem.zoteroItem?.key;
    const metadata = { codeId, functionName };
    saveMetadataToZotero(userId, itemKey, metadata);
  }
}

export const insertCitationFromSidebarCommand = (zoteroItem: any) => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !zoteroItem) {
    return;
  }

  const functionName = "function_from_sidebar";
  const fileName = extractFileName(editor.document.fileName);
  const codeId = generateCodeId(functionName, fileName);
  const titleOfItem = getZoteroItemTitle(zoteroItem);

  const languageId = editor.document.languageId;
  const snippet = renderTemplate(
    languageId,
    zoteroItem,
    { codeId, functionName }
  );

  if (snippet) {
    editor.insertSnippet(snippet);

    // See insertCitationCommand's matching comment above for why this is
    // gated on ITEMS_SOURCE: this is a legacy Zotero-only write-back with no
    // Replica equivalent, and must not fire for Replica-sourced items.
    if (contextService.getContext(ZOTERO_CONTEXT.ITEMS_SOURCE) !== "replica") {
      const userId = zoteroItem?.library?.id;
      const itemKey = zoteroItem?.key;
      const metadata = { codeId, functionName };
      saveMetadataToZotero(userId, itemKey, metadata);
    }

    vscode.window.showInformationMessage(
      `Sci2Code: Inserted citation for "${titleOfItem}".`
    );
  } else {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't add citation: This file type isn't supported.`
    );
  }
};

/**
 * Inserts a manually created citation without requiring Zotero
 */
export async function insertManualCitationCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  // Collect citation metadata from user
  const title = await vscode.window.showInputBox({
    prompt: "Enter the title of the article/book",
    placeHolder: "e.g., Introduction to Machine Learning",
    ignoreFocusOut: true,
  });

  if (!title) {
    return; // User cancelled
  }

  const authors = await vscode.window.showInputBox({
    prompt: "Enter author(s) - separate multiple authors with commas",
    placeHolder: "e.g., John Doe, Jane Smith",
    ignoreFocusOut: true,
  });

  const year = await vscode.window.showInputBox({
    prompt: "Enter publication year (optional)",
    placeHolder: "e.g., 2024",
    ignoreFocusOut: true,
  });

  const itemTypeOptions = [
    { label: "Journal Article", value: "journalArticle" },
    { label: "Book", value: "book" },
    { label: "Conference Paper", value: "conferencePaper" },
    { label: "Thesis", value: "thesis" },
    { label: "Report", value: "report" },
    { label: "Webpage", value: "webpage" },
    { label: "Other", value: "other" },
  ];

  const itemTypeSelection = await vscode.window.showQuickPick(itemTypeOptions, {
    placeHolder: "Select the type of reference",
    ignoreFocusOut: true,
  });

  const itemType = itemTypeSelection?.value || "other";

  const doi = await vscode.window.showInputBox({
    prompt: "Enter DOI (optional)",
    placeHolder: "e.g., 10.1000/xyz123",
    ignoreFocusOut: true,
  });

  const url = await vscode.window.showInputBox({
    prompt: "Enter URL (optional)",
    placeHolder: "e.g., https://example.com/article",
    ignoreFocusOut: true,
  });

  const publicationTitle = await vscode.window.showInputBox({
    prompt: "Enter journal/conference name (optional)",
    placeHolder: "e.g., Nature, IEEE Conference",
    ignoreFocusOut: true,
  });

  // Generate unique key for manual citation
  const manualKey = `MANUAL_${Date.now()}`;

  // Extract context information
  const document = editor.document;
  const position = editor.selection.active;
  const fileName = extractFileName(document.fileName);

  let functionName: string | null = null;
  for (let i = position.line; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    functionName = extractFunctionName(lineText, "javascript");
    if (functionName) break;
  }

  const codeId = generateCodeId(functionName || fileName, fileName);

  // Create a mock Zotero item with manual data
  const manualZoteroItem = {
    key: manualKey,
    data: {
      title: title || "Untitled",
      itemType: itemType,
      creators: authors
        ? authors.split(",").map((author) => {
          const trimmed = author.trim();
          const parts = trimmed.split(" ");
          return {
            firstName: parts.slice(0, -1).join(" ") || "",
            lastName: parts[parts.length - 1] || trimmed,
          };
        })
        : [],
      date: year || "",
      DOI: doi || "",
      publicationTitle: publicationTitle || "",
      abstractNote: "",
    },
    links: {
      alternate: {
        href: url || "",
      },
    },
  };

  const languageId = editor.document.languageId;
  const snippet = renderTemplate(languageId, manualZoteroItem, {
    codeId,
    functionName,
  });

  if (snippet) {
    editor.insertSnippet(snippet);
    vscode.window.showInformationMessage(
      `Sci2Code: Inserted manual citation for "${title}".`
    );
  } else {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't add citation: This file type isn't supported.`
    );
  }
}