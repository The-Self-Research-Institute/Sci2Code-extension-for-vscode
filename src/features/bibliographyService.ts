import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import { getZoteroItemTitle } from "../utils/zotero.utils";
import { findUnresolvedCitations } from "../panel/libraryModel";
import {
  Creator,
  bibtexForItems,
  creatorFullName,
  getCreators,
  getYear,
} from "./bibtex";
import { appendToBibFile, readEntriesOf, resolveBibTarget } from "./bibFile";
import { itemsForProseKeys, proseCitationKeys } from "./proseSync";
import { templateLanguageFor } from "./templateService";

const SUPPORTED_EXTENSIONS_GLOB = "**/*.{js,jsx,ts,tsx,py,r,jl,qmd,typ,typst}";
const EXCLUDE_GLOB = "**/{node_modules,out,dist,.git}/**";
const ZOTERO_KEY_PATTERN = /\b[A-Z0-9]{8}\b/g;
const COMMENT_PREFIX: Record<string, string> = {
  javascript: "//",
  typescript: "//",
  javascriptreact: "//",
  typescriptreact: "//",
  python: "#",
  r: "#",
  julia: "#",
  typst: "//",
};

// Quarto is Markdown-based, so its only comment syntax is an HTML comment.
// Languages listed here wrap each line instead of prefixing it.
const COMMENT_WRAP: Record<string, [string, string]> = {
  quarto: ["<!--", "-->"],
};

function commentLine(languageId: string, line: string): string {
  const wrap = COMMENT_WRAP[languageId];
  if (wrap) {
    return line ? `${wrap[0]} ${line} ${wrap[1]}` : `${wrap[0]} ${wrap[1]}`;
  }
  const prefix = COMMENT_PREFIX[languageId] || "#";
  return line ? `${prefix} ${line}` : prefix;
}

type CitationStyle = "APA" | "MLA" | "Numbered" | "BibTeX";

function initials(firstName: string): string {
  return firstName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
}

function formatAuthorsAPA(creators: Creator[]): string {
  if (creators.length === 0) {return "Unknown Author";}
  const names = creators.map((c) => {
    const { first, last } = creatorFullName(c);
    return first ? `${last}, ${initials(first)}` : last;
  });
  if (names.length === 1) {return names[0];}
  if (names.length <= 20) {
    return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  }
  return `${names.slice(0, 19).join(", ")}, ... ${names[names.length - 1]}`;
}

function formatAuthorsMLA(creators: Creator[]): string {
  if (creators.length === 0) {return "Unknown Author";}
  const first = creatorFullName(creators[0]);
  const firstName = first.first ? `${first.last}, ${first.first}` : first.last;
  if (creators.length === 1) {return firstName;}
  if (creators.length === 2) {
    const second = creatorFullName(creators[1]);
    const secondName = second.first ? `${second.first} ${second.last}` : second.last;
    return `${firstName}, and ${secondName}`;
  }
  return `${firstName}, et al.`;
}

function formatAuthorsPlain(creators: Creator[]): string {
  if (creators.length === 0) {return "Unknown Author";}
  const names = creators.map((c) => {
    const { first, last } = creatorFullName(c);
    return first ? `${first} ${last}` : last;
  });
  if (names.length === 1) {return names[0];}
  if (names.length <= 6) {
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }
  return `${names[0]}, et al.`;
}

function formatEntryAPA(item: any): string {
  const creators = getCreators(item);
  const authors = formatAuthorsAPA(creators);
  const year = getYear(item);
  const title = getZoteroItemTitle(item);
  const publication = item.data?.publicationTitle;
  const doiOrUrl = item.data?.DOI
    ? `https://doi.org/${item.data.DOI}`
    : item.links?.alternate?.href || item.data?.url;

  let entry = `${authors} (${year}). ${title}.`;
  if (publication) {entry += ` *${publication}*.`;}
  if (doiOrUrl) {entry += ` ${doiOrUrl}`;}
  return entry;
}

function formatEntryMLA(item: any): string {
  const creators = getCreators(item);
  const authors = formatAuthorsMLA(creators);
  const title = getZoteroItemTitle(item);
  const publication = item.data?.publicationTitle;
  const year = getYear(item);
  const doiOrUrl = item.data?.DOI
    ? `https://doi.org/${item.data.DOI}`
    : item.links?.alternate?.href || item.data?.url;

  let entry = `${authors}. "${title}."`;
  if (publication) {entry += ` *${publication}*,`;}
  entry += ` ${year}.`;
  if (doiOrUrl) {entry += ` ${doiOrUrl}`;}
  return entry;
}

function formatEntryNumbered(item: any, index: number): string {
  const creators = getCreators(item);
  const authors = formatAuthorsPlain(creators);
  const year = getYear(item);
  const title = getZoteroItemTitle(item);
  const publication = item.data?.publicationTitle;
  const doiOrUrl = item.data?.DOI
    ? `https://doi.org/${item.data.DOI}`
    : item.links?.alternate?.href || item.data?.url;

  let entry = `[${index}] ${authors} (${year}). ${title}.`;
  if (publication) {entry += ` *${publication}*.`;}
  if (doiOrUrl) {entry += ` ${doiOrUrl}`;}
  return entry;
}

function formatBibliography(items: any[], style: CitationStyle): string {
  if (style === "BibTeX") {
    return bibtexForItems(items).text;
  }

  const sorted =
    style === "Numbered"
      ? items
      : [...items].sort((a, b) => {
          const lastA = getCreators(a)[0] ? creatorFullName(getCreators(a)[0]).last : "";
          const lastB = getCreators(b)[0] ? creatorFullName(getCreators(b)[0]).last : "";
          return lastA.localeCompare(lastB);
        });

  const lines = sorted.map((item, i) => {
    if (style === "APA") {return formatEntryAPA(item);}
    if (style === "MLA") {return formatEntryMLA(item);}
    return formatEntryNumbered(item, i + 1);
  });

  return `## References\n\n${lines.join("\n\n")}`;
}

export function extractCitedKeys(text: string, knownKeys: Set<string>): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const matches = text.match(ZOTERO_KEY_PATTERN) || [];
  for (const token of matches) {
    if (knownKeys.has(token) && !seen.has(token)) {
      seen.add(token);
      found.push(token);
    }
  }
  return found;
}

export async function readWorkspaceText(): Promise<string> {
  const files = await vscode.workspace.findFiles(SUPPORTED_EXTENSIONS_GLOB, EXCLUDE_GLOB);
  const decoder = new TextDecoder("utf-8");
  const contents = await Promise.all(
    files.map(async (uri) => {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return decoder.decode(bytes);
      } catch {
        return "";
      }
    })
  );
  return contents.join("\n");
}

export interface BibliographyOptions {
  scope?: "file" | "workspace";
  output?: "cursor" | "file" | "clipboard";
}

export async function generateBibliographyCommand(options: BibliographyOptions = {}): Promise<void> {
  const zoteroItems: any[] = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || [];
  if (zoteroItems.length === 0) {
    vscode.window.showWarningMessage(
      "Sci2Code: No Zotero library loaded. Sign in and refresh before generating a bibliography."
    );
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const hasWorkspace = (vscode.workspace.workspaceFolders?.length || 0) > 0;

  if (!editor && !hasWorkspace) {
    vscode.window.showWarningMessage(
      "Sci2Code: Open a file or a workspace folder to scan for citations."
    );
    return;
  }

  let scope: "file" | "workspace" = "workspace";
  const presetScope =
    options.scope === "file" && editor
      ? "file"
      : options.scope === "workspace" && hasWorkspace
        ? "workspace"
        : undefined;
  if (presetScope) {
    scope = presetScope;
  } else if (editor && hasWorkspace) {
    const scopePick = await vscode.window.showQuickPick(
      [
        { label: "Current File", value: "file" as const },
        { label: "Entire Workspace", value: "workspace" as const },
      ],
      { placeHolder: "Scan for citations in..." }
    );
    if (!scopePick) {return;}
    scope = scopePick.value;
  } else if (editor && !hasWorkspace) {
    scope = "file";
  }

  const stylePick = await vscode.window.showQuickPick(
    [
      { label: "APA", description: "American Psychological Association" },
      { label: "MLA", description: "Modern Language Association" },
      { label: "Numbered", description: "[1], [2], [3] reference list" },
      { label: "BibTeX", description: ".bib entries" },
    ],
    { placeHolder: "Citation style" }
  );
  if (!stylePick) {return;}
  const style = stylePick.label as CitationStyle;

  const text = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Sci2Code: Scanning for citations..." },
    async () => (scope === "file" ? editor!.document.getText() : await readWorkspaceText())
  );

  const knownKeys = new Set<string>(zoteroItems.map((item) => item.key));
  const citedKeys = extractCitedKeys(text, knownKeys);
  const unresolved = findUnresolvedCitations(text, knownKeys);
  if (unresolved.length > 0) {
    vscode.window.showWarningMessage(
      `Sci2Code: ${unresolved.length} citation${unresolved.length === 1 ? " is" : "s are"} not in your Zotero library and ${unresolved.length === 1 ? "was" : "were"} left out: ${unresolved.map((u) => u.title).join(", ")}. Open "Cited in file" in the Sci2Code sidebar to add ${unresolved.length === 1 ? "it" : "them"} to Zotero.`
    );
  }

  const itemsByKey = new Map(zoteroItems.map((item) => [item.key, item]));
  const citedItems = citedKeys.map((key) => itemsByKey.get(key)).filter(Boolean);

  const language = editor?.document.languageId;
  if (scope === "file" && editor && (language === "quarto" || language === "typst")) {
    const proseKeys = proseCitationKeys(editor.document.getText(), language);
    if (proseKeys.length > 0) {
      let entries: Awaited<ReturnType<typeof readEntriesOf>> = [];
      try {
        const { declared, fallback } = await resolveBibTarget(editor.document);
        entries = await readEntriesOf(declared.length > 0 ? declared : [fallback]);
      } catch {
        entries = [];
      }
      for (const item of itemsForProseKeys(proseKeys, entries, zoteroItems)) {
        if (!citedItems.some((existing: any) => existing.key === item.key)) {
          citedItems.push(item);
        }
      }
    }
  }

  if (citedItems.length === 0) {
    vscode.window.showInformationMessage(
      "Sci2Code: No Sci2Code citations found in the scanned scope."
    );
    return;
  }

  if (style === "BibTeX") {
    const { invalid } = bibtexForItems(citedItems);
    if (invalid.length > 0) {
      const titles = invalid.map((k) => `"${itemsByKey.get(k)?.data?.title || k}"`).join(", ");
      vscode.window.showWarningMessage(
        `Sci2Code: Left out ${titles} because the citation key or fields cannot be written as valid BibTeX (check the Citation Key line in the item's Extra field).`
      );
      if (invalid.length === citedItems.length) {
        return;
      }
    }
  }

  const bibliography = formatBibliography(citedItems, style);

  const outputOptions: { label: string; value: "file" | "cursor" | "clipboard" }[] = [
    { label: "Write to File", value: "file" },
    { label: "Copy to Clipboard", value: "clipboard" },
  ];
  if (editor) {
    outputOptions.unshift({ label: "Insert at Cursor", value: "cursor" as const });
  }
  const presetOutput = outputOptions.find((o) => o.value === options.output);
  const outputPick =
    presetOutput ||
    (await vscode.window.showQuickPick(outputOptions, {
      placeHolder: "Where should the bibliography go?",
    }));
  if (!outputPick) {return;}

  if (outputPick.value === "clipboard") {
    await vscode.env.clipboard.writeText(bibliography);
    vscode.window.showInformationMessage(
      `Sci2Code: Copied a ${style} bibliography with ${citedItems.length} entr${citedItems.length === 1 ? "y" : "ies"} to the clipboard.`
    );
    return;
  }

  if (outputPick.value === "cursor" && editor) {
    const languageId = templateLanguageFor(editor.document, editor.selection.active);
    const commented = bibliography
      .split("\n")
      .map((line) => commentLine(languageId, line))
      .join("\n");
    await editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, `${commented}\n`);
    });
    vscode.window.showInformationMessage(
      `Sci2Code: Inserted a ${style} bibliography with ${citedItems.length} entr${citedItems.length === 1 ? "y" : "ies"}.`
    );
    return;
  }

  const fileName = style === "BibTeX" ? "references.bib" : "REFERENCES.md";
  const targetFolder =
    scope === "file" && editor
      ? vscode.Uri.joinPath(editor.document.uri, "..")
      : vscode.workspace.workspaceFolders![0].uri;
  const targetUri = vscode.Uri.joinPath(targetFolder, fileName);

  if (style === "BibTeX") {
    // Append-only: never overwrite a .bib file the user already has.
    try {
      const result = await appendToBibFile(targetUri, citedItems);
      const doc = await vscode.workspace.openTextDocument(targetUri);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(
        `Sci2Code: Added ${result.added.length} new, ${result.existing.length} already in ${fileName}` +
          (result.invalid.length ? `, ${result.invalid.length} skipped as invalid.` : ".")
      );
    } catch (e) {
      vscode.window.showErrorMessage(
        `Sci2Code: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    return;
  }

  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(bibliography, "utf-8"));
  const doc = await vscode.workspace.openTextDocument(targetUri);
  await vscode.window.showTextDocument(doc);
  vscode.window.showInformationMessage(
    `Sci2Code: Wrote a ${style} bibliography with ${citedItems.length} entr${citedItems.length === 1 ? "y" : "ies"} to ${fileName}.`
  );
}
