import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { getSnippetForLanguage } from "./snippetFactory";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  extractFileName,
  extractFunctionName,
  generateCodeId,
  getZoteroItemTitle,
  saveMetadataToZotero,
} from "../utils/zotero.utils";

interface ZoteroQuickPickItem extends vscode.QuickPickItem {
  zoteroItem: any;
}

export async function insertCitationCommand() {
  const zoteroItems = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);

  if (!zoteroItems || zoteroItems.length === 0) {
    const learnMore = "Configure Zotero API Key";
    const result = await vscode.window.showErrorMessage(
      "Sci2Code: No Zotero items found. Please check your Zotero API configuration.",
      learnMore
    );

    if (result === learnMore) {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "sci2code.zoteroApiKey"
      );
    }
    return;
  }

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

  let functionName: string | null = "";
  for (let i = position.line; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    functionName = extractFunctionName(lineText, "js"); // Assuming 'js' for now
    if (functionName) break;
  }

  const codeId = generateCodeId(functionName || fileName, fileName);
  const titleOfItem = getZoteroItemTitle(selectedItem.zoteroItem);

  const languageId = editor.document.languageId;
  const snippet = getSnippetForLanguage(
    languageId,
    codeId,
    titleOfItem,
    selectedItem.zoteroItem
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

  vscode.window.showInformationMessage(
    `Sci2Code: Inserted citation for "${titleOfItem}".`
  );
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
  const snippet = getSnippetForLanguage(
    languageId,
    codeId,
    titleOfItem,
    zoteroItem
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

  const userId = zoteroItem?.library?.id;
  const itemKey = zoteroItem?.key;
  const metadata = { codeId, functionName };
  saveMetadataToZotero(userId, itemKey, metadata);

  vscode.window.showInformationMessage(
    `Sci2Code: Inserted citation for "${titleOfItem}".`
  );
};
