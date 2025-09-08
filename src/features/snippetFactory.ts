import * as vscode from "vscode";
import { templateToSnippet as jsTemplate } from "./jsDocCompletion";
import { templateToSnippet as pyTemplate } from "./pyDocCompletion";
import { templateToSnippet as rTemplate } from "./rCompletion";
import { templateToSnippet as juliaTemplate } from "./juliaCompletion";

/**
 * Generates a citation snippet based on the document's language.
 *
 * @param languageId The language ID of the active editor (e.g., 'python', 'typescript').
 * @param codeId The unique identifier for the code block.
 * @param titleOfItem The title of the Zotero item.
 * @param zoteroItem The full Zotero item object.
 * @returns A VS Code SnippetString or null if the language is not supported.
 */
export function getSnippetForLanguage(
    languageId: string,
    codeId: string,
    titleOfItem: string,
    zoteroItem: any
): vscode.SnippetString | null {
    switch (languageId) {
        case "javascript":
        case "typescript":
        case "javascriptreact":
        case "typescriptreact":
            return jsTemplate(codeId, titleOfItem, zoteroItem);

        case "python":
            return pyTemplate(codeId, titleOfItem, zoteroItem);

        case "r":
            return rTemplate(codeId, titleOfItem, zoteroItem);

        case "julia":
            return juliaTemplate(codeId, titleOfItem, zoteroItem);

        default:
            vscode.window.showWarningMessage(`Sci2Code: Citation snippets are not supported for '${languageId}' files yet.`);
            return null;
    }
}

