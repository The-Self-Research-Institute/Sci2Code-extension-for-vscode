import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import { fetchZoteroItem, updateZoteroTags } from "../zotero/api";
import { generateSha256 } from "../utils/utils";

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

export function getZoteroItemTitle(zoteroItem: any): string {
  if (zoteroItem?.data) {
    const itemType = zoteroItem.data.itemType;

    let rawText;

    if (itemType === "note") {
      rawText = zoteroItem.data.note;
    } else if (itemType === "annotation") {
      rawText = zoteroItem.data.annotationText || "Untitled Annotation";
    } else {
      rawText = zoteroItem.data.title
        ? `${zoteroItem.data.title} ${
            zoteroItem?.data?.DOI ? `| ${zoteroItem?.data?.DOI}` : ""
          } ${zoteroItem?.data?.ISBN ? `| ${zoteroItem?.data?.ISBN}` : ""} ${
            zoteroItem?.data?.ISSN ? `| ${zoteroItem?.data?.ISSN}` : ""
          }`
        : "Untitled Article";
    }

    const plainText =
      rawText.replace(/<\/?[^>]+(>|$)/g, "").trim() || "Untitled";

    return limitCharacters(plainText, 75);
  }
  return "Unknown Item";
}

function limitCharacters(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const limitedText = text.substring(0, maxChars);
  return limitedText + "...";
}

function extractFunctionName(lineText: string): string | null {
  const functionRegex = /def\s+(\w+)\s*\(/;
  const match = lineText.match(functionRegex);
  return match ? match[1] : null;
}

function extractFileName(fullPath: string): string {
  const fileName = fullPath.split(/[/\\]/).pop() || "";
  return fileName;
}

function generateUniqueString() {
  const uuid = crypto.randomUUID();
  const date = Date.now();
  const uniqueString = `${uuid.slice(0, 4)}${date.toString().slice(0, 4)}`;
  console.log(`Generated unique string: ${uniqueString}`);
  return uniqueString;
}

function generateCodeId(functionName: string, fileName: string) {
  const uniqueString = generateUniqueString();
  const uniqueFunctionName = `${functionName}____${uniqueString}`;
  const functionNameAbbreviation = generateSha256(uniqueFunctionName);
  const fileNameAbbreviation = generateSha256(fileName);
  const codeId = `${functionNameAbbreviation.slice(
    0,
    4
  )}${fileNameAbbreviation.slice(0, 4)}`;
  return codeId;
}

function templateToSnippet(
  codeId: string,
  titleOfItem: string,
  zoteroItem: any
): vscode.SnippetString {
  const template = `""" 
    * @ZoteroArticleIDs: ${zoteroItem?.data?.key}
    * @ZoteroitemType: ${zoteroItem?.data?.itemType}
    * @ZoteroArticleNames: ${titleOfItem}
    * @ZoteroArticleURLs: ${zoteroItem?.links?.alternate?.href}
    * @CodeID: ${codeId}
    """`;
  return new vscode.SnippetString(template);
}

async function saveMetadataToZotero(
  userId: string,
  itemKey: string,
  metadata: { codeId: string; functionName: string }
) {
  try {
    const session = await vscode.authentication.getSession(
      ZoteroAuthenticationProvider.id,
      []
    );
    const apiKey = session?.accessToken;

    if (apiKey) {
      const zoteroItem = await fetchZoteroItem(userId, itemKey, apiKey!);
      if (!zoteroItem.ok) {
        throw new Error(zoteroItem.statusText);
      }
      const zoteroItemRes: any = await zoteroItem.json();
      const version = zoteroItemRes.version;
      const tags = zoteroItemRes?.data?.tags || [];
      const updatedTags = [...tags, { tag: JSON.stringify(metadata) }];

      const addZoteroTag = await updateZoteroTags(
        userId,
        itemKey,
        apiKey!,
        version,
        updatedTags
      );
      if (!addZoteroTag.ok) {
        throw new Error(addZoteroTag.statusText);
      }

      vscode.window.showInformationMessage(
        "Zotero | Successfully attached codeId to Zotero."
      );
    } else {
      throw new Error(
        "Zotero | Invalid Session. Please sign out and try again."
      );
    }
  } catch (err: any) {
    vscode.window.showInformationMessage(
      `Zotero | Failed to attach codeId to Zotero. Please try again.`
    );
  }
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

      let functionName = extractFunctionName(nextLineText);

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
