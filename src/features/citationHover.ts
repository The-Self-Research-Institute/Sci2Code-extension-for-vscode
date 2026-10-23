import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  getZoteroItemTitle,
  formatCitationMetadata,
  getCitationDetail,
} from "../utils/zotero.utils";

const ZOTERO_KEY_AT_CURSOR = /\b[A-Z0-9]{8}\b/;
const OPEN_CITATION_COMMAND = "sci2code.openCitation";
const COPY_KEY_COMMAND = "sci2code.copyCitationKey";

const LANGUAGES = [
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
  "python",
  "r",
  "julia",
];

const SELECTOR: vscode.DocumentSelector = LANGUAGES.flatMap((language) => [
  { language, scheme: "file" },
  { language, scheme: "vscode-notebook-cell" },
]);

function findItem(key: string): any | undefined {
  const items: any[] = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || [];
  return items.find((item) => item.key === key);
}

function itemWebUrl(item: any): string | undefined {
  if (item.links?.alternate?.href) return item.links.alternate.href;
  if (item.data?.DOI) return `https://doi.org/${item.data.DOI}`;
  return item.data?.url || undefined;
}

function commandLink(label: string, command: string, key: string): string {
  return `[${label}](command:${command}?${encodeURIComponent(JSON.stringify([key]))})`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}\[\]()#+\-.!|<>])/g, "\\$1");
}

export function registerCitationHover(): vscode.Disposable {
  const hover = vscode.languages.registerHoverProvider(SELECTOR, {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position, ZOTERO_KEY_AT_CURSOR);
      if (!range) return undefined;

      const key = document.getText(range);
      const item = findItem(key);
      if (!item) return undefined;

      const md = new vscode.MarkdownString(undefined, true);
      md.isTrusted = { enabledCommands: [OPEN_CITATION_COMMAND, COPY_KEY_COMMAND] };

      md.appendMarkdown(`**${escapeMarkdown(getZoteroItemTitle(item))}**\n\n`);
      md.appendMarkdown(`${escapeMarkdown(formatCitationMetadata(item))}\n\n`);

      const detail = getCitationDetail(item);
      if (detail) md.appendMarkdown(`${escapeMarkdown(detail)}\n\n`);

      const actions: string[] = [];
      if (itemWebUrl(item)) actions.push(commandLink("$(link-external) Open", OPEN_CITATION_COMMAND, key));
      actions.push(commandLink("$(copy) Copy key", COPY_KEY_COMMAND, key));
      md.appendMarkdown(actions.join("  |  "));

      return new vscode.Hover(md, range);
    },
  });

  const open = vscode.commands.registerCommand(OPEN_CITATION_COMMAND, async (key: string) => {
    const item = typeof key === "string" ? findItem(key) : undefined;
    const url = item && itemWebUrl(item);
    if (!url) {
      vscode.window.showWarningMessage("Sci2Code: No URL available for this citation.");
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(url));
  });

  const copy = vscode.commands.registerCommand(COPY_KEY_COMMAND, async (key: string) => {
    if (typeof key !== "string") return;
    await vscode.env.clipboard.writeText(key);
    vscode.window.showInformationMessage(`Copied Zotero key: ${key}`);
  });

  return vscode.Disposable.from(hover, open, copy);
}
