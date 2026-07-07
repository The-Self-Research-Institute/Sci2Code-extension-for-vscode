import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import { getZoteroItemTitle } from "../utils/zotero.utils";

const SUPPORTED_EXTENSIONS_GLOB = "**/*.{js,jsx,ts,tsx,py,r,jl}";
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
};

type CitationStyle = "APA" | "MLA" | "Numbered" | "BibTeX";

interface Creator {
  creatorType?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

function creatorFullName(creator: Creator): { first: string; last: string } {
  if (creator.lastName || creator.firstName) {
    return { first: creator.firstName || "", last: creator.lastName || "" };
  }
  return { first: "", last: creator.name || "Unknown" };
}

function initials(firstName: string): string {
  return firstName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
}

function getYear(zoteroItem: any): string {
  const date = zoteroItem.data?.date || "";
  return date.match(/\d{4}/)?.[0] || "n.d.";
}

function getCreators(zoteroItem: any): Creator[] {
  return (zoteroItem.data?.creators || []).filter(
    (c: Creator) => !c.creatorType || c.creatorType === "author"
  );
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

const BIBTEX_TYPE: Record<string, string> = {
  journalArticle: "article",
  book: "book",
  bookSection: "incollection",
  conferencePaper: "inproceedings",
  thesis: "phdthesis",
  report: "techreport",
  webpage: "misc",
};

function bibtexKey(item: any, usedKeys: Set<string>): string {
  const creators = getCreators(item);
  const last = creators.length > 0 ? creatorFullName(creators[0]).last : "unknown";
  const base = `${last.replace(/[^a-zA-Z0-9]/g, "")}${getYear(item)}`.toLowerCase() || "ref";
  let key = base;
  let suffix = 0;
  while (usedKeys.has(key)) {
    suffix += 1;
    key = `${base}${String.fromCharCode(96 + suffix)}`;
  }
  usedKeys.add(key);
  return key;
}

function formatEntryBibTeX(item: any, usedKeys: Set<string>): string {
  const type = BIBTEX_TYPE[item.data?.itemType] || "misc";
  const key = bibtexKey(item, usedKeys);
  const creators = getCreators(item);
  const authorField = creators
    .map((c) => {
      const { first, last } = creatorFullName(c);
      return first ? `${last}, ${first}` : last;
    })
    .join(" and ");

  const fields: string[] = [];
  if (authorField) {fields.push(`  author = {${authorField}}`);}
  fields.push(`  title = {${getZoteroItemTitle(item)}}`);
  fields.push(`  year = {${getYear(item)}}`);
  if (item.data?.publicationTitle) {
    fields.push(`  journal = {${item.data.publicationTitle}}`);
  }
  if (item.data?.volume) {fields.push(`  volume = {${item.data.volume}}`);}
  if (item.data?.issue) {fields.push(`  number = {${item.data.issue}}`);}
  if (item.data?.pages) {fields.push(`  pages = {${item.data.pages}}`);}
  if (item.data?.DOI) {fields.push(`  doi = {${item.data.DOI}}`);}
  const url = item.links?.alternate?.href || item.data?.url;
  if (url) {fields.push(`  url = {${url}}`);}

  return `@${type}{${key},\n${fields.join(",\n")}\n}`;
}

function formatBibliography(items: any[], style: CitationStyle): string {
  if (style === "BibTeX") {
    const usedKeys = new Set<string>();
    return items.map((item) => formatEntryBibTeX(item, usedKeys)).join("\n\n");
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

function extractCitedKeys(text: string, knownKeys: Set<string>): string[] {
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

async function readWorkspaceText(): Promise<string> {
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

export async function generateBibliographyCommand(): Promise<void> {
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
  if (editor && hasWorkspace) {
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

  if (citedKeys.length === 0) {
    vscode.window.showInformationMessage(
      "Sci2Code: No Sci2Code citations found in the scanned scope."
    );
    return;
  }

  const itemsByKey = new Map(zoteroItems.map((item) => [item.key, item]));
  const citedItems = citedKeys.map((key) => itemsByKey.get(key)).filter(Boolean);

  const bibliography = formatBibliography(citedItems, style);

  const outputOptions: { label: string; value: "file" | "cursor" }[] = [
    { label: "Write to File", value: "file" },
  ];
  if (editor) {
    outputOptions.unshift({ label: "Insert at Cursor", value: "cursor" as const });
  }
  const outputPick = await vscode.window.showQuickPick(outputOptions, {
    placeHolder: "Where should the bibliography go?",
  });
  if (!outputPick) {return;}

  if (outputPick.value === "cursor" && editor) {
    const prefix = COMMENT_PREFIX[editor.document.languageId] || "#";
    const commented = bibliography
      .split("\n")
      .map((line) => (line ? `${prefix} ${line}` : prefix))
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

  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(bibliography, "utf-8"));
  const doc = await vscode.workspace.openTextDocument(targetUri);
  await vscode.window.showTextDocument(doc);
  vscode.window.showInformationMessage(
    `Sci2Code: Wrote a ${style} bibliography with ${citedItems.length} entr${citedItems.length === 1 ? "y" : "ies"} to ${fileName}.`
  );
}
