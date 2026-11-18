import * as vscode from "vscode";
import {
  BibDeclaration,
  BibEntry,
  BibSource,
  parseBibEntries,
  BibSyncPlan,
  extractBibliographyDeclaration,
  extractBibliographyPaths,
  planBibSync,
  projectBibliographyApplies,
} from "./bibtex";

const DEFAULT_BIB_NAME = "references.bib";

/** A problem the user can fix (unsaved edits, unreadable file); shown as-is. */
export class BibFileError extends Error {}

function isNotFound(e: unknown): boolean {
  const code = (e as { code?: string } | undefined)?.code;
  return code === "FileNotFound" || code === "ENOENT" || code === "EntryNotFound";
}

/** File bytes, or `undefined` only when the file does not exist. Any other failure throws. */
async function readBytes(uri: vscode.Uri): Promise<Uint8Array | undefined> {
  try {
    return await vscode.workspace.fs.readFile(uri);
  } catch (e) {
    if (isNotFound(e)) {
      return undefined;
    }
    throw new BibFileError(
      `Could not read ${uri.path.split("/").pop()}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  const bytes = await readBytes(uri);
  return bytes === undefined ? undefined : new TextDecoder("utf-8").decode(bytes);
}

async function modifiedTime(uri: vscode.Uri): Promise<number | undefined> {
  try {
    return (await vscode.workspace.fs.stat(uri)).mtime;
  } catch {
    return undefined;
  }
}

// One write at a time per file, so two overlapping syncs cannot read the same
// starting contents and overwrite each other's additions.
const queues = new Map<string, Promise<unknown>>();

function serialized<T>(uri: vscode.Uri, task: () => Promise<T>): Promise<T> {
  const id = uri.toString();
  const run = (queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(task);
  const tail = run.catch(() => undefined);
  queues.set(id, tail);
  void tail.then(() => {
    if (queues.get(id) === tail) {
      queues.delete(id);
    }
  });
  return run;
}

function assertNoUnsavedEdits(uri: vscode.Uri): void {
  const dirty = vscode.workspace.textDocuments.find(
    (d) => d.isDirty && d.uri.toString() === uri.toString()
  );
  if (dirty) {
    throw new BibFileError(
      `${uri.path.split("/").pop()} has unsaved changes. Save it first so nothing you typed is overwritten.`
    );
  }
}

/**
 * Appends only the missing entries to `target`. The file is created only when
 * it does not exist; an unreadable file, a file with unsaved edits, or a file
 * that changed on disk while we worked all stop the sync without writing.
 * Existing content is never rewritten. Extra `.bib` files the document also
 * declares (`otherBibs`) are checked so nothing is duplicated.
 */
export function appendToBibFile(
  target: vscode.Uri,
  items: any[],
  otherBibs: vscode.Uri[] = []
): Promise<BibSyncPlan> {
  return serialized(target, async () => {
    assertNoUnsavedEdits(target);

    const before = await modifiedTime(target);
    const originalBytes = (await readBytes(target)) ?? new Uint8Array();
    const existing = new TextDecoder("utf-8").decode(originalBytes);
    const others: string[] = [];
    for (const uri of otherBibs) {
      const text = await readText(uri);
      if (text !== undefined) {
        others.push(text);
      }
    }

    const plan = planBibSync([existing, ...others], items);
    if (plan.append) {
      if ((await modifiedTime(target)) !== before) {
        throw new BibFileError(
          `${target.path.split("/").pop()} changed while syncing. Nothing was written; run the sync again.`
        );
      }
      await vscode.workspace.fs.writeFile(
        target,
        Buffer.concat([originalBytes, Buffer.from(plan.append, "utf-8")])
      );
    }
    return plan;
  });
}

export interface BibTarget {
  /** Every distinct .bib file the document declares, in order. Empty when none. */
  declared: vscode.Uri[];
  /** `references.bib` next to the document, used only when nothing is declared. */
  fallback: vscode.Uri;
}

const dirOf = (uri: vscode.Uri) => vscode.Uri.joinPath(uri, "..");

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function sourceFor(languageId: string): BibSource | undefined {
  return languageId === "quarto" ? "quarto-document" : languageId === "typst" ? "typst" : undefined;
}

/**
 * Finds the .bib files the document really uses: its own declaration (Quarto
 * front matter, Typst `#bibliography`) plus the nearest `_quarto.yml` above a
 * Quarto file. When several are declared the caller must ask which to use.
 */
export async function resolveBibTarget(document: vscode.TextDocument): Promise<BibTarget> {
  const docDir = dirOf(document.uri);
  const declared: vscode.Uri[] = [];
  const add = (base: vscode.Uri, rel: string) => {
    const uri = rel.startsWith("/")
      ? vscode.Uri.joinPath(vscode.workspace.getWorkspaceFolder(document.uri)?.uri ?? base, rel)
      : vscode.Uri.joinPath(base, rel);
    if (!declared.some((u) => u.toString() === uri.toString())) {
      declared.push(uri);
    }
  };

  const source = sourceFor(document.languageId);
  let own: BibDeclaration = { paths: [], isList: false };
  if (source) {
    own = extractBibliographyDeclaration(document.getText(), source);
    own.paths.forEach((rel) => add(docDir, rel));
  }

  if (source === "quarto-document") {
    const root = vscode.workspace.getWorkspaceFolder(document.uri)?.uri;
    let dir = docDir;
    for (let depth = 0; depth < 20; depth++) {
      const config = vscode.Uri.joinPath(dir, "_quarto.yml");
      const text = (await exists(config)) ? await readText(config) : undefined;
      if (text !== undefined) {
        const project = extractBibliographyDeclaration(text, "quarto-project");
        if (projectBibliographyApplies(own, project)) {
          project.paths.forEach((rel) => add(dir, rel));
        }
        break;
      }
      const parent = dirOf(dir);
      if (parent.toString() === dir.toString() || (root && dir.toString() === root.toString())) {
        break;
      }
      dir = parent;
    }
  }

  return { declared, fallback: vscode.Uri.joinPath(docDir, DEFAULT_BIB_NAME) };
}

export interface BibContext {
  entries: BibEntry[];
  label: string;
  declared: boolean;
}

export async function loadBibContext(document: vscode.TextDocument): Promise<BibContext> {
  const { declared, fallback } = await resolveBibTarget(document);
  const files = declared.length > 0 ? declared : [fallback];
  const entries: BibEntry[] = [];
  for (const uri of files) {
    try {
      const text = await readText(uri);
      if (text) {
        entries.push(...parseBibEntries(text));
      }
    } catch {
      continue;
    }
  }
  const name = files[0].path.split("/").pop() || "references.bib";
  return {
    entries,
    declared: declared.length > 0,
    label: files.length > 1 ? `${name} +${files.length - 1}` : name,
  };
}

export async function readEntriesOf(files: vscode.Uri[]): Promise<BibEntry[]> {
  const entries: BibEntry[] = [];
  for (const uri of files) {
    const text = await readText(uri);
    if (text) {
      entries.push(...parseBibEntries(text));
    }
  }
  return entries;
}

export function declarationInsertion(
  document: vscode.TextDocument,
  bibName: string
): { position: vscode.Position; text: string } {
  const text = document.getText();
  if (document.languageId === "typst") {
    const end = document.lineAt(document.lineCount - 1).range.end;
    return { position: end, text: `\n\n#bibliography("${bibName}")\n` };
  }
  if (/^﻿?---[ \t]*\r?\n/.test(text)) {
    return { position: new vscode.Position(1, 0), text: `bibliography: ${bibName}\n` };
  }
  return { position: new vscode.Position(0, 0), text: `---\nbibliography: ${bibName}\n---\n\n` };
}
