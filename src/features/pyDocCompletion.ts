import * as vscode from "vscode";
import { sha256 } from "js-sha256";

import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import { fetchZoteroItem, updateZoteroTags } from "../zotero/api";

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
        super(
            `""" ${zoteroItem?.data?.title} | ${zoteroItem?.links?.alternate?.href} """`,
            vscode.CompletionItemKind.Text
        );
        this.detail = vscode.l10n.t(`Zotero | ${zoteroItem?.data?.title}`);
        this.sortText = "\0";

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

function extractFunctionName(lineText: string): string | null {
    const functionRegex = /def\s+(\w+)\s*\(/;
    const match = lineText.match(functionRegex);
    console.log(`Extracted function name: ${match ? match[1] : 'none'}`);
    return match ? match[1] : null;
}

function extractFileName(fullPath: string): string {
    const fileName = fullPath.split(/[/\\]/).pop() || "";
    console.log(`Extracted filename: ${fileName}`);
    return fileName;
}

function generateSha256(name: string) {
    const hash = sha256.create();
    hash.update(name);
    const hashValue = hash.hex();
    console.log(`Generated SHA-256 hash: ${hashValue}`);
    return hashValue;
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
    const codeId = `${functionNameAbbreviation.slice(0, 4)}${fileNameAbbreviation.slice(0, 4)}`;
    console.log(`Generated Code ID: ${codeId}`);
    return codeId;
}

function templateToSnippet(codeId: string, zoteroItem: any): vscode.SnippetString {
    const template = `""" 
    * @ZoteroArticleIDs: ${zoteroItem?.data?.key}
    * @ZoteroArticleNames: ${zoteroItem?.data?.title}
    * @ZoteroArticleURLs: ${zoteroItem?.links?.alternate?.href}
    * @CodeID: ${codeId}
    """`;
    console.log(`Generated snippet: ${template}`);
    return new vscode.SnippetString(template);
}

async function saveMetadataToZotero(userId: string, itemKey: string, metadata: { codeId: string; functionName: string; }) {
    try {
        console.log(`Saving metadata for userId: ${userId}, itemKey: ${itemKey}`);
        const session = await vscode.authentication.getSession(ZoteroAuthenticationProvider.id, []);
        const apiKey = session?.accessToken;

        if (apiKey) {
            const zoteroItem = await fetchZoteroItem(userId, itemKey, apiKey!);
            if (!zoteroItem.ok) {
                console.error(`Failed to fetch Zotero item: ${zoteroItem.statusText}`);
                throw new Error(zoteroItem.statusText);
            }
            const zoteroItemRes: any = await zoteroItem.json();
            const version = zoteroItemRes.version;
            const tags = zoteroItemRes?.data?.tags || [];
            const updatedTags = [...tags, { tag: JSON.stringify(metadata) }];

            const addZoteroTag = await updateZoteroTags(userId, itemKey, apiKey!, version, updatedTags);
            if (!addZoteroTag.ok) {
                console.error(`Failed to update Zotero tags: ${addZoteroTag.statusText}`);
                throw new Error(addZoteroTag.statusText);
            }

            vscode.window.showInformationMessage("Zotero | Successfully attached codeId to Zotero.");
            console.log("Successfully attached codeId to Zotero.");
        } else {
            console.error("Invalid Session: No API key found.");
            throw new Error("Zotero | Invalid Session. Please sign out and try again.");
        }
    } catch (err: any) {
        console.error(`Error saving metadata to Zotero: ${err.message}`);
        vscode.window.showInformationMessage(`Zotero | Failed to attach codeId to Zotero. Please try again.`);
    }
}

class PyDocCompletionProvider implements vscode.CompletionItemProvider {
    constructor() {}

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[] | undefined> {
        console.log("provideCompletionItems called"); // Debugging line
        if (!this.isPotentiallyValidDocCompletionPosition(document, position)) {
            console.log("Invalid completion position, returning undefined.");
            return undefined;
        }

        const line = document.lineAt(position.line);
        const nextLine = line.lineNumber + 1;

        if (nextLine < document.lineCount) {
            let nextLineText = document.lineAt(nextLine).text;

            let functionName = extractFunctionName(nextLineText);
            console.log(`Function name extracted: ${functionName}`);

            if (functionName) {
                const zoteroItems = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);
                const fileName = extractFileName(document.fileName);
                const codeId = generateCodeId(functionName, fileName);

                const zoteroCompletionItems = zoteroItems.map((zoteroItem: any) => {
                    const completionItem = new PyDocCompletionItem(
                        document,
                        position,
                        zoteroItem,
                        {
                            codeId,
                            functionName,
                        }
                    );

                    completionItem.insertText = templateToSnippet(codeId, zoteroItem);
                    console.log(`Completion item created for: ${zoteroItem?.data?.title}`);
                    return completionItem;
                });

                return zoteroCompletionItems;
            } else {
                vscode.window.showInformationMessage("Zotero | No function name found in the next line.");
                console.log("No function name found in the next line.");
            }
        } else {
            vscode.window.showInformationMessage("Zotero | No next line available.");
            console.log("No next line available.");
        }
    }

    public resolveCompletionItem(
        item: PyDocCompletionItem,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CompletionItem> {
        const userId = item?.zoteroItem?.library?.id;
        const itemKey = item?.zoteroItem?.key;
        const metadata = item.metadata;
        console.log(`Resolving completion item for userId: ${userId}, itemKey: ${itemKey}`);
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

export function registerPyDocCompletion(selector: vscode.DocumentSelector): vscode.Disposable {
    console.log("Registering Python docstring completion provider.");
    return vscode.languages.registerCompletionItemProvider(
        selector,
        new PyDocCompletionProvider(),
        "\"" // You might also want to add other characters if you wish to trigger on `"""` as well
    );
}