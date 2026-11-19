import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import { extractCitedKeys, readWorkspaceText } from "./bibliographyService";
import {
  BibFileError,
  appendToBibFile,
  declarationInsertion,
  readEntriesOf,
  resolveBibTarget,
} from "./bibFile";
import { BibSyncPlan } from "./bibtex";
import { proseCitationKeys, resolveProseKeys } from "./proseSync";

async function insertDeclaration(editor: vscode.TextEditor, bibName: string): Promise<boolean> {
  const declaration = declarationInsertion(editor.document, bibName);
  return editor.edit((edit) => edit.insert(declaration.position, declaration.text));
}

const baseName = (uri: vscode.Uri) => uri.path.split("/").pop() || "references.bib";

async function chooseTarget(files: vscode.Uri[]): Promise<vscode.Uri | undefined> {
  const pick = await vscode.window.showQuickPick(
    files.map((uri) => ({
      label: baseName(uri),
      description: vscode.workspace.asRelativePath(uri),
      uri,
    })),
    { placeHolder: "This document declares several .bib files. Which one should get the new references?" }
  );
  return pick?.uri;
}

export async function syncBibliographyCommand(): Promise<void> {
  const zoteroItems: any[] = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || [];
  if (zoteroItems.length === 0) {
    vscode.window.showWarningMessage(
      "Sci2Code: No Zotero library loaded. Sign in and refresh before syncing a .bib file."
    );
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      "Sci2Code: Open the Quarto or Typst document whose .bib file you want to sync."
    );
    return;
  }

  let scope: "file" | "workspace" = "file";
  if ((vscode.workspace.workspaceFolders?.length || 0) > 0) {
    const pick = await vscode.window.showQuickPick(
      [
        { label: "Current File", value: "file" as const },
        { label: "Entire Workspace", value: "workspace" as const },
      ],
      { placeHolder: "Collect citations from..." }
    );
    if (!pick) {return;}
    scope = pick.value;
  }

  const text = scope === "file" ? editor.document.getText() : await readWorkspaceText();
  const knownKeys = new Set<string>(zoteroItems.map((item) => item.key));
  const citedKeys = extractCitedKeys(text, knownKeys);
  const language = editor.document.languageId;
  const proseKeys =
    scope === "file" && (language === "quarto" || language === "typst")
      ? proseCitationKeys(editor.document.getText(), language)
      : [];
  if (citedKeys.length === 0 && proseKeys.length === 0) {
    vscode.window.showInformationMessage(
      "Sci2Code: Nothing to sync. This document has no Sci2Code reference comments and no @citations. Use Cite in Text to add a citation, then sync."
    );
    return;
  }
  const byKey = new Map(zoteroItems.map((item) => [item.key, item]));
  const commentItems = citedKeys.map((k) => byKey.get(k)).filter(Boolean);

  try {
    const { declared, fallback } = await resolveBibTarget(editor.document);
    let target = declared[0] ?? fallback;
    if (declared.length > 1) {
      const chosen = await chooseTarget(declared);
      if (!chosen) {return;}
      target = chosen;
    }
    const others = declared.filter((u) => u.toString() !== target.toString());

    const known = await readEntriesOf(declared.length > 0 ? declared : [fallback]);
    const prose = resolveProseKeys(proseKeys, known, zoteroItems);
    const items = [...commentItems];
    for (const candidate of prose.add) {
      if (!items.some((item) => item.key === candidate.key)) {
        items.push(candidate);
      }
    }
    const emptyPlan: BibSyncPlan = { append: "", added: [], existing: [], invalid: [] };
    const plan = items.length > 0 ? await appendToBibFile(target, items, others) : emptyPlan;
    const name = baseName(target);

    const allKeys = Array.from(
      new Set([...plan.added, ...plan.existing].map((m) => m.bibKey).concat(prose.present))
    );
    const labels = (keys: string[]) => keys.map((k) => `@${k}`).join(", ");
    const parts: string[] = [];
    if (plan.added.length > 0) {
      parts.push(`added ${plan.added.length} to ${name} (${plan.added.map((m) => m.bibKey).join(", ")})`);
    }
    if (plan.existing.length > 0) {
      parts.push(`already in the file: ${plan.existing.map((m) => m.bibKey).join(", ")}`);
    }
    if (prose.present.length > 0) {
      parts.push(
        `${prose.present.length} cited in the text ${prose.present.length === 1 ? "is" : "are"} already in ${name} (${labels(prose.present)})`
      );
    }
    if (prose.ambiguous.length > 0) {
      parts.push(`${labels(prose.ambiguous)} fits several papers in your library, so use Cite in Text to choose one`);
    }
    if (prose.unknown.length > 0) {
      parts.push(
        `could not match ${labels(prose.unknown)} to ${name} or your Zotero library (they may be figure or section labels)`
      );
    }
    if (plan.invalid.length > 0) {
      const titles = plan.invalid.map((k) => `"${byKey.get(k)?.data?.title || k}"`);
      parts.push(`skipped ${titles.join(", ")} because its citation key or fields cannot be written as a valid BibTeX entry (check the Citation Key line in the item's Extra field)`);
    }
    const summary = `Sci2Code: ${parts.join("; ") || `${name} is already up to date`}.`;

    const canDeclare = declared.length === 0 && ["quarto", "typst"].includes(editor.document.languageId);
    const actions = ["Open File"];
    if (allKeys.length > 0) {actions.push("Copy Keys");}
    if (canDeclare) {
      actions.push(`Add bibliography to ${editor.document.languageId === "typst" ? "Typst" : "Quarto"} file`);
    }

    const choice = await vscode.window.showInformationMessage(summary, ...actions);
    if (choice === "Open File") {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target));
    } else if (choice === "Copy Keys") {
      await vscode.env.clipboard.writeText(allKeys.join(", "));
    } else if (choice && canDeclare) {
      await insertDeclaration(editor, name);
    }
  } catch (e) {
    const reason = e instanceof BibFileError ? e.message : `Sync failed: ${e instanceof Error ? e.message : String(e)}`;
    vscode.window.showErrorMessage(`Sci2Code: ${reason}`);
  }
}
