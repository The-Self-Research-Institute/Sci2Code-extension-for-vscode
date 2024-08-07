import * as vscode from "vscode";
import { sha256 } from "js-sha256";

import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";

class JsDocCompletionItem extends vscode.CompletionItem {
  constructor(
    public readonly document: vscode.TextDocument,
    public readonly position: vscode.Position,
    public readonly zoteroItem: any
  ) {
    super(
      `/** ${zoteroItem?.data?.title} | ${zoteroItem?.links?.alternate?.href} */`,
      vscode.CompletionItemKind.Text
    );
    this.detail = vscode.l10n.t(`Zotero | ${zoteroItem?.data?.title}`);
    this.sortText = "\0";

    const line = document.lineAt(position.line).text;
    const prefix = line.slice(0, position.character).match(/\/\**\s*$/);
    const suffix = line.slice(position.character).match(/^\s*\**\//);
    const start = position.translate(0, prefix ? -prefix[0].length : 0);
    const range = new vscode.Range(
      start,
      position.translate(0, suffix ? suffix[0].length : 0)
    );
    this.range = { inserting: range, replacing: range };
  }
}

function extractFunctionName(lineText: string): string | null {
  // This regex matches common function definitions, but may need to adjust it for different languages or styles
  const functionRegex = /function\s+(\w+)\s*\(/;
  const match = lineText.match(functionRegex);
  return match ? match[1] : null;
}

function extractFileName(fullPath: string): string {
  // Extract the filename from the full path
  return fullPath.split(/[/\\]/).pop() || "";
}

function generateSha256(name: string) {
  // Generate SHA-256 hash
  const hash = sha256.create();
  hash.update(name);
  return hash.hex();
}

function generateUniqueString() {
  const uuid = crypto.randomUUID();
  const date = Date.now();
  return `${uuid.slice(0, 4)}${date.toString().slice(0, 4)}`;
}

function generateCodeId(functionName: string, fileName: string) {
  const uniqueString = generateUniqueString();
  const uniqueFunctionName = `${functionName}____${uniqueString}`;
  const functionNameAbbreviation = generateSha256(uniqueFunctionName);
  const fileNameAbbreviation = generateSha256(fileName);
  return `${functionNameAbbreviation.slice(0, 4)}${fileNameAbbreviation.slice(
    0,
    4
  )}`;
}

function templateToSnippet(
  functionName: string,
  fileName: string,
  zoteroItem: any
): vscode.SnippetString {
  const codeId = generateCodeId(functionName, fileName);
  const template = `/** 
	 * @ZoteroArticleIDs: ${zoteroItem?.data?.key}
	 * @ZoteroArticleNames: ${zoteroItem?.data?.title}
	 * @ZoteroArticleURLs: ${zoteroItem?.links?.alternate?.href}
	 * @CodeID: ${codeId}
	 */`;
  return new vscode.SnippetString(template);
}

class JsDocCompletionProvider implements vscode.CompletionItemProvider {
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

      let functionName = extractFunctionName(nextLineText);

      if (functionName) {
        const zoteroItems = contextService.getContext(
          ZOTERO_CONTEXT.ZOTERO_ITEMS
        );

        const zoteroCompletionItems = zoteroItems.map((zoteroItem: any) => {
          const completionItem = new JsDocCompletionItem(
            document,
            position,
            zoteroItem
          );

          const fileName = extractFileName(document.fileName);

          completionItem.insertText = templateToSnippet(
            functionName,
            fileName,
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

  private isPotentiallyValidDocCompletionPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): boolean {
    // Only show the JSdoc completion when the everything before the cursor is whitespace
    // or could be the opening of a comment
    const line = document.lineAt(position.line).text; //
    const prefix = line.slice(0, position.character);
    if (!/^\s*$|\/\*\*\s*$|^\s*\/\*\*+\s*$/.test(prefix)) {
      return false;
    }

    // And everything after is possibly a closing comment or more whitespace
    const suffix = line.slice(position.character);
    return /^\s*(\*+\/)?\s*$/.test(suffix);
  }
}

export function registerJsDocCompletion(selector: vscode.DocumentSelector): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    selector,
    new JsDocCompletionProvider(),
    "*"
  );
}
