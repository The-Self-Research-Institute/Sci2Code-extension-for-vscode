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

class RDocCompletionItem extends vscode.CompletionItem {
  constructor(
    public readonly document: vscode.TextDocument,
    public readonly position: vscode.Position,
    public readonly zoteroItem: any,
    public readonly metadata: {
      codeId: string;
      functionName: string;
    }
  ) {
    const titleOfItem = getZoteroItemTitle(zoteroItem);
    super(
      `#' ${zoteroItem.data.itemType}: ${titleOfItem} | ${zoteroItem?.links?.alternate?.href}`,
      vscode.CompletionItemKind.Text
    );
    this.detail = vscode.l10n.t(
      `Zotero | Type: ${zoteroItem.data.itemType}, Title: ${titleOfItem}`
    );
    this.sortText = "\0";

    const line = document.lineAt(position.line).text;
    const prefix = line.slice(0, position.character).match(/^\s*#'?\s*$/);
    const start = position.translate(0, prefix ? -prefix[0].length : 0);
    const range = new vscode.Range(start, position);
    this.range = { inserting: range, replacing: range };
  }
}

function templateToSnippet(
  codeId: string,
  titleOfItem: string,
  zoteroItem: any
): vscode.SnippetString {
  const template = `#' 
    #' @ZoteroArticleIDs: ${zoteroItem?.data?.key}
    #' @ZoteroitemType: ${zoteroItem?.data?.itemType}
    #' @ZoteroArticleNames: ${titleOfItem}
    #' @ZoteroArticleURLs: ${zoteroItem?.links?.alternate?.href}
    #' @CodeID: ${codeId}
    #'`;
  return new vscode.SnippetString(template);
}

class RDocCompletionProvider implements vscode.CompletionItemProvider {
  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | undefined> {
    const line = document.lineAt(position.line);

    const prefix = line.text.slice(0, position.character);
    if (!/^\s*#'?\s*$/.test(prefix)) return;

    const nextLine = line.lineNumber + 1;
    if (nextLine >= document.lineCount) return;

    const nextLineText = document.lineAt(nextLine).text;

    const functionName = extractFunctionName(nextLineText, "r");
    if (!functionName) {
      vscode.window.showInformationMessage(
        "Zotero | No function name found in the next line."
      );
      return;
    }

    const zoteroItems = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);
    const fileName = extractFileName(document.fileName);
    const codeId = generateCodeId(functionName, fileName);

    return zoteroItems.map((zoteroItem: any) => {
      const title = getZoteroItemTitle(zoteroItem);
      const completionItem = new RDocCompletionItem(
        document,
        position,
        zoteroItem,
        {
          codeId,
          functionName,
        }
      );
      completionItem.insertText = templateToSnippet(codeId, title, zoteroItem);
      return completionItem;
    });
  }

  public resolveCompletionItem(
    item: RDocCompletionItem,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CompletionItem> {
    const userId = item?.zoteroItem?.library?.id;
    const itemKey = item?.zoteroItem?.key;
    const metadata = item.metadata;
    saveMetadataToZotero(userId, itemKey, metadata);
    return item;
  }
}

export function registerRDocCompletion(
  selector: vscode.DocumentSelector
): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    selector,
    new RDocCompletionProvider(),
    "#"
  );
}
