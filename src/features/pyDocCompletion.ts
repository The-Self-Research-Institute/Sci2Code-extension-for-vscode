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

class PyDocCompletionItem extends vscode.CompletionItem {
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
      `""" ${zoteroItem.data.itemType}: ${titleOfItem} | ${zoteroItem?.links?.alternate?.href} """`,
      vscode.CompletionItemKind.Text
    );
    this.detail = vscode.l10n.t(
      `Zotero | Type: ${zoteroItem.data.itemType}, Title: ${titleOfItem}`
    );
    const line = document.lineAt(position.line).text;
    const prefix = line.slice(0, position.character).match(/"""?\s*$/);
    const suffix = line.slice(position.character).match(/^\s*"""/);
    const start = position.translate(0, prefix ? -prefix[0].length : 0);
    const range = new vscode.Range(
      start,
      position.translate(0, suffix ? suffix[0].length : 0)
    );
    this.range = { inserting: range, replacing: range };
  }
}

interface ZoteroItem {
  data: {
    key: string;
    itemType: string;
    DOI?: string;
    ISBN?: string;
    ISSN?: string;
  };
  links?: {
    alternate?: {
      href: string;
    };
  };
}

export function templateToSnippet(
  codeId: string,
  titleOfItem: string,
  zoteroItem: ZoteroItem
): vscode.SnippetString {
  const fields: { [key: string]: string | undefined } = {};

  const { key, itemType, DOI, ISBN, ISSN } = zoteroItem?.data || {};
  const url = zoteroItem?.links?.alternate?.href;

  fields.ZoteroArticleIDs = key;
  fields.ZoteroitemType = itemType;
  fields.ZoteroArticleNames = titleOfItem;
  fields.ZoteroArticleURLs = url;

  switch (itemType) {
    case 'journalArticle':
      if (DOI) fields.ZoteroArticleDOI = DOI;
      if (ISSN) fields.ZoteroArticleISSN = ISSN;
      break;
    case 'book':
      if (DOI) fields.ZoteroArticleDOI = DOI;
      if (ISBN) fields.ZoteroArticleISBN = ISBN;
      break;
    case 'conferencePaper':
    case 'bookSection':
    case 'report':
      if (DOI) fields.ZoteroArticleDOI = DOI;
      break;
  }

  fields.CodeID = codeId;

  const commentLines = Object.entries(fields)
    .filter(([, value]) => value)
    .map(([key, value]) => ` * @${key}: ${value}`);

  const template = `"""\n${commentLines.join('\n')}\n """`;

  return new vscode.SnippetString(template);
}
class PyDocCompletionProvider implements vscode.CompletionItemProvider {
  constructor() {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | undefined> {
    if (!this.isPotentiallyValidDocCompletionPosition(document, position)) {
      return undefined;
    }

    const line = document.lineAt(position.line);
    const nextLine = line.lineNumber + 1;

    if (nextLine < document.lineCount) {
      let nextLineText = document.lineAt(nextLine).text;

      let functionName = extractFunctionName(nextLineText, "python");

      if (functionName) {
        const zoteroItems = contextService.getContext(
          ZOTERO_CONTEXT.ZOTERO_ITEMS
        );
        const fileName = extractFileName(document.fileName);
        const codeId = generateCodeId(functionName, fileName);

        const zoteroCompletionItems = zoteroItems.map((zoteroItem: any) => {
          const titleOfItem = getZoteroItemTitle(zoteroItem);
          const completionItem = new PyDocCompletionItem(
            document,
            position,
            zoteroItem,
            {
              codeId,
              functionName,
            }
          );

          completionItem.insertText = templateToSnippet(
            codeId,
            titleOfItem,
            zoteroItem
          );

          return completionItem;
        });

        return zoteroCompletionItems;
      } else {
        vscode.window.showInformationMessage(
          "Zotero | No function name found in the next line."
        );
      }
    } else {
      vscode.window.showInformationMessage("Zotero | No next line available.");
    }
  }

  public resolveCompletionItem(
    item: PyDocCompletionItem,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CompletionItem> {
    const userId = item?.zoteroItem?.library?.id;
    const itemKey = item?.zoteroItem?.key;
    const metadata = item.metadata;
    saveMetadataToZotero(userId, itemKey, metadata);
    return item;
  }

  private isPotentiallyValidDocCompletionPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): boolean {
    const line = document.lineAt(position.line).text;
    const prefix = line.slice(0, position.character);
    const isValid = /^\s*$|^\s*"""/.test(prefix);
    const suffix = line.slice(position.character);
    return isValid && /^\s*("""|''')?\s*$/.test(suffix);
  }
}

export function registerPyDocCompletion(
  selector: vscode.DocumentSelector
): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    selector,
    new PyDocCompletionProvider(),
    '"' // You might also want to add other characters if you wish to trigger on `"""` as well
  );
}
