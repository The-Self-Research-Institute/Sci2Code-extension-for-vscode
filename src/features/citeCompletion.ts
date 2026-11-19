import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  formatCitationMetadata,
  getCitationDetail,
  getZoteroItemTitle,
} from "../utils/zotero.utils";
import { inQuartoFence, inQuartoFrontMatter } from "../utils/quartoChunk";
import { isCitationTrigger } from "./citeFlow";

export const CITE_IN_TEXT_COMMAND = "sci2code.citeInText";

const SKIPPED_TYPES = ["note", "attachment", "annotation"];

export function citeCompletionItems(
  range: vscode.Range,
  insertText: string,
  filterPrefix: string,
  replace: { line: number; start: number; end: number }
): vscode.CompletionItem[] {
  const items: any[] = (contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || []).filter(
    (item: any) => item?.data && !SKIPPED_TYPES.includes(item.data.itemType)
  );

  return items.map((item, index) => {
    const title = getZoteroItemTitle(item);
    const meta = formatCitationMetadata(item);
    const completion = new vscode.CompletionItem(
      { label: title, description: meta },
      vscode.CompletionItemKind.Reference
    );
    completion.detail = getCitationDetail(item) || meta;
    completion.insertText = insertText;
    completion.range = range;
    completion.filterText = `${filterPrefix}${title} ${meta}`;
    completion.sortText = String(index).padStart(6, "0");
    completion.command = {
      command: CITE_IN_TEXT_COMMAND,
      title: "Cite in Text",
      arguments: [item, { replace }],
    };
    return completion;
  });
}

export function registerCiteCompletion(): vscode.Disposable {
  const selector: vscode.DocumentSelector = ["quarto", "typst"].flatMap((language) => [
    { language, scheme: "file" },
    { language, scheme: "vscode-notebook-cell" },
  ]);

  return vscode.languages.registerCompletionItemProvider(
    selector,
    {
      provideCompletionItems(document, position) {
        const line = document.lineAt(position.line).text;
        const typed = line.slice(0, position.character).match(/@([^\s@[\];]*)$/);
        if (!typed) {
          return undefined;
        }
        const atChar = position.character - typed[0].length;
        if (!isCitationTrigger(line.slice(0, atChar))) {
          return undefined;
        }
        if (document.languageId === "quarto") {
          const lineAt = (i: number) => document.lineAt(i).text;
          if (inQuartoFence(lineAt, position.line) || inQuartoFrontMatter(lineAt, document.lineCount, position.line)) {
            return undefined;
          }
        }

        const range = new vscode.Range(position.line, atChar, position.line, position.character);
        return citeCompletionItems(range, "@", "@", {
          line: position.line,
          start: atChar,
          end: atChar + 1,
        });
      },
    },
    "@"
  );
}
