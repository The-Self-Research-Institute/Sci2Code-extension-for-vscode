import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  extractFileName,
  extractFunctionName,
  generateCodeId,
  getZoteroItemTitle,
  saveMetadataToZotero,
} from "../utils/zotero.utils";
import { renderTemplate } from "./templateService";

interface ZoteroQuickPickItem extends vscode.QuickPickItem {
  zoteroItem: any;
}

export async function insertCitationCommand(statusItem: vscode.StatusBarItem) {
 
  const zoteroItems = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);

  if (!zoteroItems || zoteroItems.length === 0) {
    const refreshAndTryAgain = "Refresh Zotero Library";
    const result = await vscode.window.showErrorMessage(
      "Sci2Code: No Zotero items found. Please try refreshing your library or checking your API key.",
      refreshAndTryAgain
    );

    if (result === refreshAndTryAgain) {
      vscode.commands.executeCommand('zotero.refresh');
    }
    return;
  }

  // --- Show Progress in Status Bar ---
  statusItem.text = '$(sync~spin) Searching Zotero...';

  const quickPickItems: ZoteroQuickPickItem[] = zoteroItems.map(
    (item: any) => ({
      label: getZoteroItemTitle(item),
      description: `Type: ${item.data.itemType}`,
      detail: item.links?.alternate?.href,
      zoteroItem: item,
    })
  );

  const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
    placeHolder: "Search your Zotero library (e.g., author, title, year)",
    matchOnDescription: true,
    matchOnDetail: true,
    ignoreFocusOut: true,
  });

  statusItem.text = '$(zap) Zotero: Ready'; // Reset status bar

  if (!selectedItem) {
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
  
  const userId = selectedItem.zoteroItem?.library?.id;
  const itemKey = selectedItem.zoteroItem?.key;
  const metadata = { codeId, functionName };
  saveMetadataToZotero(userId, itemKey, metadata);
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

    const userId = zoteroItem?.library?.id;
    const itemKey = zoteroItem?.key;
    const metadata = { codeId, functionName };
    saveMetadataToZotero(userId, itemKey, metadata);

    vscode.window.showInformationMessage(
      `Sci2Code: Inserted citation for "${titleOfItem}".`
    );
  } else {
    vscode.window.showErrorMessage(
      `Sci2Code: Couldn't add citation: This file type isn't supported.`
    );
  }
};