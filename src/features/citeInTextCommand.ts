import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  formatCitationMetadata,
  getCitationDetail,
  getZoteroItemTitle,
} from "../utils/zotero.utils";
import { inQuartoFence, inQuartoFrontMatter } from "../utils/quartoChunk";
import { insertCitationFromSidebarCommand } from "./insertCitationCommand";
import {
  BibFileError,
  appendToBibFile,
  declarationInsertion,
  readEntriesOf,
  resolveBibTarget,
} from "./bibFile";
import { CiteOutcome, CitePorts, ProseLanguage, citeInText } from "./citeFlow";

export interface CiteOptions {
  replace?: { line: number; start: number; end: number };
}

const baseName = (uri: vscode.Uri) => uri.path.split("/").pop() || "references.bib";

export function proseLanguageAt(document: vscode.TextDocument, position: vscode.Position): ProseLanguage | undefined {
  if (document.languageId === "typst") {
    return "typst";
  }
  if (document.languageId === "quarto") {
    const lineAt = (i: number) => document.lineAt(i).text;
    if (
      inQuartoFence(lineAt, position.line) ||
      inQuartoFrontMatter(lineAt, document.lineCount, position.line)
    ) {
      return undefined;
    }
    return "quarto";
  }
  return undefined;
}

async function pickItem(): Promise<any | undefined> {
  const items: any[] = (contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || []).filter(
    (item: any) => !["note", "attachment", "annotation"].includes(item.data?.itemType)
  );
  if (items.length === 0) {
    vscode.window.showWarningMessage(
      "Sci2Code: No Zotero library loaded. Sign in and refresh before citing."
    );
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    items.map((item) => ({
      label: getZoteroItemTitle(item),
      description: formatCitationMetadata(item),
      detail: getCitationDetail(item),
      item,
    })),
    { placeHolder: "Search your Zotero library", matchOnDescription: true, matchOnDetail: true, ignoreFocusOut: true }
  );
  return pick?.item;
}

function notify(outcome: CiteOutcome, bibName: string): void {
  switch (outcome.status) {
    case "cited":
      vscode.window.showInformationMessage(
        outcome.saved
          ? `Sci2Code: Added @${outcome.key} to ${bibName} and cited it.`
          : `Sci2Code: Cited @${outcome.key}.`
      );
      break;
    case "invalid":
      vscode.window.showErrorMessage(
        "Sci2Code: That reference cannot be written as a valid BibTeX entry (check the Citation Key line in its Extra field). Nothing was changed."
      );
      break;
    case "write-failed":
      vscode.window.showErrorMessage(
        `Sci2Code: ${outcome.message} Nothing was inserted.`
      );
      break;
    case "document-changed":
      vscode.window.showWarningMessage(
        `Sci2Code: The document changed while saving. The reference is saved as @${outcome.key}; place the cursor and run Cite in Text again to insert it.`
      );
      break;
    case "not-inserted":
      vscode.window.showWarningMessage(
        `Sci2Code: Reference saved. Citation wasn't inserted. Run Cite in Text again to retry; @${outcome.key} will be reused.`
      );
      break;
    case "cancelled":
      break;
  }
}

export async function citeInTextCommand(
  arg?: any,
  options?: CiteOptions
): Promise<CiteOutcome | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Sci2Code: Open a Quarto or Typst document first.");
    return undefined;
  }

  const document = editor.document;
  const replace = options?.replace;
  const position = replace
    ? new vscode.Position(replace.line, replace.start)
    : editor.selection.active;
  const language = proseLanguageAt(document, position);

  if (!language) {
    if (arg) {
      await insertCitationFromSidebarCommand(arg);
    } else {
      await vscode.commands.executeCommand("sci2code.insertZoteroCitation");
    }
    return undefined;
  }

  const item = arg ?? (await pickItem());
  if (!item) {
    return undefined;
  }

  const version = document.version;
  const offset = document.offsetAt(position);
  const before = document.getText(
    new vscode.Range(document.positionAt(Math.max(0, offset - 200)), position)
  );

  try {
    const target = await resolveBibTarget(document);
    const range = replace
      ? new vscode.Range(replace.line, replace.start, replace.line, replace.end)
      : new vscode.Range(position, position);

    const ports: CitePorts<vscode.Uri> = {
      declared: async () => target.declared,
      fallback: () => target.fallback,
      entries: (files) => readEntriesOf(files),
      choose: async (files) => {
        const pick = await vscode.window.showQuickPick(
          files.map((uri) => ({
            label: baseName(uri),
            description: vscode.workspace.asRelativePath(uri),
            uri,
          })),
          { placeHolder: "This document declares several .bib files. Which one should get the new reference?" }
        );
        return pick?.uri;
      },
      confirmDeclaration: async (file) =>
        (await vscode.window.showInformationMessage(
          `This document does not declare a bibliography. Create ${baseName(file)} and add it to the document?`,
          { modal: true },
          "Create"
        )) === "Create",
      append: (file, others) => appendToBibFile(file, [item], others),
      unchanged: () => document.version === version && vscode.window.activeTextEditor === editor,
      apply: async (citation, declare) => {
        const declaration = declare ? declarationInsertion(document, baseName(declare)) : undefined;
        return editor.edit((edit) => {
          if (declaration) {
            edit.insert(declaration.position, declaration.text);
          }
          edit.replace(range, citation);
        });
      },
    };

    const outcome = await citeInText(item, { language, before }, ports);
    notify(outcome, baseName(target.declared[0] ?? target.fallback));
    return outcome;
  } catch (e) {
    const reason = e instanceof BibFileError ? e.message : `Cite in Text failed: ${e instanceof Error ? e.message : String(e)}`;
    vscode.window.showErrorMessage(`Sci2Code: ${reason} Nothing was inserted.`);
    return { status: "write-failed", message: reason };
  }
}
