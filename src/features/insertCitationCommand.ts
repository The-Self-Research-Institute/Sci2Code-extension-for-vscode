import { citeInTextCommand, proseLanguageAt } from "./citeInTextCommand";
import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  extractFileName,
  findFunctionNameFromLine,
  generateCodeId,
  getZoteroItemTitle,
  attachCodeIdToItem,
  formatCitationMetadata,
  getCitationDetail,
} from "../utils/zotero.utils";
import { renderTemplateAt } from "./templateService";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import { createZoteroItem } from "../zotero/api";
import { ManualCitationInput, buildManualItemData } from "../zotero/manualItem";

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

  const functionName = findFunctionNameFromLine(document, position.line);

  const codeId = generateCodeId(functionName || fileName, fileName);
  const titleOfItem = getZoteroItemTitle(selectedItem.zoteroItem);
  const snippet = renderTemplateAt(
    document,
    position,
    selectedItem.zoteroItem,
    { codeId, functionName }
  );

  if (!snippet) {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't add citation: This file type isn't supported.`
    );
    return;
  }

  if (!(await editor.insertSnippet(snippet))) {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't insert the citation. The editor rejected the edit (is the file read-only?).`
    );
    return;
  }

  vscode.window.showInformationMessage(
    `Sci2Code: Inserted citation for "${titleOfItem}".`
  );
  attachCodeIdToItem(selectedItem.zoteroItem, { codeId, functionName });
}

export const insertCitationFromSidebarCommand = async (zoteroItem: any): Promise<boolean> => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !zoteroItem) {
    return false;
  }

  const fileName = extractFileName(editor.document.fileName);
  const functionName = findFunctionNameFromLine(editor.document, editor.selection.active.line);
  const codeId = generateCodeId(functionName || fileName, fileName);
  const titleOfItem = getZoteroItemTitle(zoteroItem);

  const snippet = renderTemplateAt(
    editor.document,
    editor.selection.active,
    zoteroItem,
    { codeId, functionName }
  );

  if (!snippet) {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't add citation: This file type isn't supported.`
    );
    return false;
  }

  const inserted = await editor.insertSnippet(snippet);
  if (!inserted) {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't insert the citation. The editor rejected the edit (is the file read-only?).`
    );
    return false;
  }

  attachCodeIdToItem(zoteroItem, { codeId, functionName });
  vscode.window.showInformationMessage(
    `Sci2Code: Inserted citation for "${titleOfItem}".`
  );
  return true;
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

  const document = editor.document;
  const position = editor.selection.active;
  const fileName = extractFileName(document.fileName);

  const functionName = findFunctionNameFromLine(document, position.line);

  const codeId = generateCodeId(functionName || fileName, fileName);

  const input = {
    title,
    authors,
    year,
    itemType,
    doi,
    url,
    publicationTitle,
  };

  let manualZoteroItem: any;
  let savedToZotero = false;
  try {
    manualZoteroItem = await createManualItemInZotero(input);
    savedToZotero = true;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    vscode.window.showWarningMessage(
      `Sci2Code: Could not save "${title}" to Zotero: ${reason.replace(/\.$/, "")}. The citation was inserted locally only.`
    );
    const data = buildManualItemData(input) as any;
    manualZoteroItem = {
      key: `MANUAL_${Date.now()}`,
      data: { ...data, DOI: data.DOI || "", publicationTitle: data.publicationTitle || "" },
      links: { alternate: { href: url || "" } },
    };
  }

  if (vscode.window.activeTextEditor === editor && proseLanguageAt(document, editor.selection.active)) {
    const outcome = await citeInTextCommand(manualZoteroItem);
    if (outcome?.status === "cited" && savedToZotero) {
      vscode.window.showInformationMessage(`Sci2Code: Saved "${title}" to Zotero.`);
    }
    return;
  }

  const snippet = renderTemplateAt(editor.document, position, manualZoteroItem, {
    codeId,
    functionName,
  });

  if (!snippet) {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't add citation: This file type isn't supported.`
    );
    return;
  }

  if (!(await editor.insertSnippet(snippet))) {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't insert the citation. The editor rejected the edit (is the file read-only?).`
    );
    return;
  }

  if (savedToZotero) {
    attachCodeIdToItem(manualZoteroItem, { codeId, functionName });
  }
  vscode.window.showInformationMessage(
    savedToZotero
      ? `Sci2Code: Saved "${title}" to Zotero and inserted the citation.`
      : `Sci2Code: Inserted manual citation for "${title}".`
  );
}

export async function createManualItemInZotero(input: ManualCitationInput): Promise<any> {
  const userId = contextService.getContext(ZOTERO_CONTEXT.USERID);
  const session = await vscode.authentication.getSession(
    ZoteroAuthenticationProvider.id,
    [],
    { createIfNone: false }
  );
  if (!userId || !session) {
    throw new Error("you are not logged in to Zotero.");
  }

  const created = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "Sci2Code: Saving reference to Zotero",
    },
    () => createZoteroItem(String(userId), session.accessToken, buildManualItemData(input))
  );

  const current: any[] = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || [];
  contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, [created, ...current]);
  return created;
}
