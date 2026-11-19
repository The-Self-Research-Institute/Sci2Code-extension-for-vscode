export interface Creator {
  creatorType?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export function creatorFullName(creator: Creator): { first: string; last: string } {
  if (creator.lastName || creator.firstName) {
    return { first: creator.firstName || "", last: creator.lastName || "" };
  }
  return { first: "", last: creator.name || "Unknown" };
}

export function getYear(zoteroItem: any): string {
  const date = zoteroItem.data?.date || "";
  return date.match(/\d{4}/)?.[0] || "n.d.";
}

export function getCreators(zoteroItem: any): Creator[] {
  return (zoteroItem.data?.creators || []).filter(
    (c: Creator) => !c.creatorType || c.creatorType === "author"
  );
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

export function betterBibTeXKey(item: any): string | undefined {
  const extra: string = item.data?.extra || "";
  return extra.match(/^\s*Citation Key:\s*(\S+)/im)?.[1];
}

export function bibtexKey(item: any, usedKeys: Set<string>): string {
  const creators = getCreators(item);
  const last = creators.length > 0 ? creatorFullName(creators[0]).last : "unknown";
  const generated = `${last.replace(/[^a-zA-Z0-9]/g, "")}${getYear(item)}`.toLowerCase() || "ref";
  const base = betterBibTeXKey(item) || generated;
  let key = base;
  let suffix = 0;
  while (usedKeys.has(key)) {
    suffix += 1;
    key = `${base}${String.fromCharCode(96 + suffix)}`;
  }
  usedKeys.add(key);
  return key;
}

export function escapeBraces(value: string): string {
  const unmatched = new Set<number>();
  const open: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "{") {
      open.push(i);
    } else if (value[i] === "}") {
      if (open.length > 0) {
        open.pop();
      } else {
        unmatched.add(i);
      }
    }
  }
  open.forEach((i) => unmatched.add(i));
  if (unmatched.size === 0) {
    return value;
  }
  let out = "";
  for (let i = 0; i < value.length; i++) {
    out += unmatched.has(i)
      ? value[i] === "{"
        ? "\\textbraceleft{}"
        : "\\textbraceright{}"
      : value[i];
  }
  return out;
}

function bracesBalanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "{") {
      depth++;
    } else if (ch === "}" && --depth < 0) {
      return false;
    }
  }
  return depth === 0;
}

const bibValue = (value: unknown): string =>
  escapeBraces(String(value).replace(/\s*\r?\n\s*/g, " ").trim());

const VALID_KEY = /^[\p{L}\p{N}][\p{L}\p{N}_:.+/-]*$/u;

export interface CiteKeyInfo {
  key: string;
  inFile: boolean;
}

export function describeCiteKey(item: any, entries: BibEntry[]): CiteKeyInfo {
  const doi = item.data?.DOI ? normalizeDoi(item.data.DOI) : "";
  const titleYear = titleYearOf(item.data?.title, getYear(item));
  const hit = doi
    ? entries.find((e) => e.doi === doi)
    : titleYear
      ? entries.find((e) => e.titleYear === titleYear)
      : undefined;
  if (hit) {
    return { key: hit.key, inFile: true };
  }
  return { key: bibtexKey(item, new Set(entries.map((e) => e.key))), inFile: false };
}

export function isValidBibKey(key: string): boolean {
  return VALID_KEY.test(key);
}

export function formatEntryBibTeX(item: any, usedKeys: Set<string>): string {
  return formatEntry(item, bibtexKey(item, usedKeys));
}

function formatEntry(item: any, key: string): string {
  const type = BIBTEX_TYPE[item.data?.itemType] || "misc";
  const authorField = getCreators(item)
    .map((c) => {
      const { first, last } = creatorFullName(c);
      return first ? `${last}, ${first}` : last;
    })
    .join(" and ");

  const fields: string[] = [];
  if (authorField) {fields.push(`  author = {${bibValue(authorField)}}`);}
  fields.push(`  title = {${bibValue(item.data?.title || "Untitled")}}`);
  fields.push(`  year = {${getYear(item)}}`);
  if (item.data?.publicationTitle) {
    fields.push(`  journal = {${bibValue(item.data.publicationTitle)}}`);
  }
  if (item.data?.volume) {fields.push(`  volume = {${bibValue(item.data.volume)}}`);}
  if (item.data?.issue) {fields.push(`  number = {${bibValue(item.data.issue)}}`);}
  if (item.data?.pages) {fields.push(`  pages = {${bibValue(item.data.pages)}}`);}
  if (item.data?.DOI) {fields.push(`  doi = {${bibValue(item.data.DOI)}}`);}
  const url = item.data?.url;
  if (url) {fields.push(`  url = {${bibValue(url)}}`);}

  return `@${type}{${key},\n${fields.join(",\n")}\n}`;
}

export function isWellFormedEntry(block: string, key: string): boolean {
  if (!bracesBalanced(block)) {
    return false;
  }
  const parsed = parseBibEntries(block);
  return parsed.length === 1 && parsed[0].key === key;
}

export interface BibEntry {
  key: string;
  doi?: string;
  titleYear?: string;
}

export function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function fieldValue(body: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*`, "i").exec(body);
  if (!match) {return undefined;}
  const rest = body.slice(match.index + match[0].length);
  if (rest.startsWith("{")) {
    let depth = 0;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "{") {depth++;}
      else if (rest[i] === "}" && --depth === 0) {return rest.slice(1, i);}
    }
    return rest.slice(1);
  }
  if (rest.startsWith('"')) {
    const end = rest.indexOf('"', 1);
    return rest.slice(1, end === -1 ? undefined : end);
  }
  return rest.match(/^[^,}\n]*/)?.[0].trim();
}

function titleYearOf(title: string | undefined, year: string | undefined): string | undefined {
  const t = title ? normalizeTitle(title) : "";
  const y = year?.match(/\d{4}/)?.[0] || "";
  return t ? `${t}|${y}` : undefined;
}

export function parseBibEntries(bibText: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const starts = [...bibText.matchAll(/^[ \t]*@(\w+)\s*[{(]\s*([^,\s}]+)\s*,/gm)];
  starts.forEach((match, i) => {
    const type = match[1].toLowerCase();
    if (type === "comment" || type === "string" || type === "preamble") {return;}
    const bodyStart = match.index! + match[0].length;
    const bodyEnd = i + 1 < starts.length ? starts[i + 1].index! : bibText.length;
    const body = bibText.slice(bodyStart, bodyEnd);
    const rawDoi = fieldValue(body, "doi");
    const doi = rawDoi ? normalizeDoi(rawDoi.replace(/[{}",]/g, "")) : undefined;
    entries.push({
      key: match[2],
      doi: doi || undefined,
      titleYear: titleYearOf(fieldValue(body, "title"), fieldValue(body, "year")),
    });
  });
  return entries;
}

export type BibSource = "quarto-document" | "quarto-project" | "typst";

const isBibPath = (value: string) => /\.bib(tex)?$/i.test(value);
const unquote = (raw: string) => raw.trim().replace(/^["']|["']$/g, "");

function yamlBibliography(yaml: string): BibDeclaration {
  const found: string[] = [];
  let isList = false;
  const lines = yaml.split(/\r?\n/);
  const at = lines.findIndex((line) => /^bibliography\s*:/.test(line));
  if (at >= 0) {
    const rest = lines[at].replace(/^bibliography\s*:\s*/, "").replace(/\s+#.*$/, "").trim();
    if (rest.startsWith("[")) {
      isList = true;
      rest.replace(/^\[|\]$/g, "").split(",").forEach((v) => found.push(unquote(v)));
    } else if (rest) {
      found.push(unquote(rest));
    } else {
      isList = true;
      for (let j = at + 1; j < lines.length; j++) {
        const item = lines[j].match(/^\s*-\s*(.+?)\s*$/);
        if (!item) {break;}
        found.push(unquote(item[1].replace(/\s+#.*$/, "")));
      }
    }
  }
  return { paths: found, isList };
}

function frontMatter(text: string): string {
  return (
    text.match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/)?.[1] ?? ""
  );
}

export function stripTypstNonCode(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("//", i) && text[i - 1] !== ":") {
      while (i < text.length && text[i] !== "\n") {i++;}
      continue;
    }
    if (text.startsWith("/*", i)) {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text.startsWith("/*", j)) {depth++; j += 2;}
        else if (text.startsWith("*/", j)) {depth--; j += 2;}
        else {j++;}
      }
      if (depth > 0) {
        out += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      i = j;
      continue;
    }
    if (text[i] === "`") {
      let ticks = 0;
      while (text[i + ticks] === "`") {ticks++;}
      const close = text.indexOf("`".repeat(ticks), i + ticks);
      i = close === -1 ? text.length : close + ticks;
      continue;
    }
    out += text[i++];
  }
  return out;
}

export function extractBibliographyPaths(text: string, source: BibSource): string[] {
  return extractBibliographyDeclaration(text, source).paths;
}

export interface BibDeclaration {
  paths: string[];
  isList: boolean;
}

export function extractBibliographyDeclaration(text: string, source: BibSource): BibDeclaration {
  let declaration: BibDeclaration;
  if (source === "quarto-document") {
    declaration = yamlBibliography(frontMatter(text));
  } else if (source === "quarto-project") {
    declaration = yamlBibliography(text);
  } else {
    const raw: string[] = [];
    for (const call of stripTypstNonCode(text).matchAll(/#bibliography\s*\(\s*(\([^)]*\)|"[^"]*")/g)) {
      for (const str of call[1].matchAll(/"([^"]*)"/g)) {
        raw.push(str[1]);
      }
    }
    declaration = { paths: raw, isList: raw.length > 1 };
  }
  const paths = declaration.paths.filter((p, i) => isBibPath(p) && declaration.paths.indexOf(p) === i);
  return { paths, isList: declaration.isList };
}

export function projectBibliographyApplies(own: BibDeclaration, project?: BibDeclaration): boolean {
  if (own.paths.length === 0 || own.isList) {
    return true;
  }
  return !!project && project.isList;
}

export function bibtexForItems(items: any[]): { text: string; invalid: string[] } {
  const plan = planBibSync([""], items);
  return { text: plan.append.trimEnd(), invalid: plan.invalid };
}

export interface BibSyncMatch {
  zoteroKey: string;
  bibKey: string;
}

export interface BibSyncPlan {
  append: string;
  added: BibSyncMatch[];
  existing: (BibSyncMatch & { reason: "doi" | "title" })[];
  invalid: string[];
}

export function planBibSync(existingTexts: string[], items: any[]): BibSyncPlan {
  const entries = existingTexts.flatMap(parseBibEntries);
  const usedKeys = new Set(entries.map((e) => e.key));
  const byDoi = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const e of entries) {
    if (e.doi && !byDoi.has(e.doi)) {byDoi.set(e.doi, e.key);}
    if (e.titleYear && !byTitle.has(e.titleYear)) {byTitle.set(e.titleYear, e.key);}
  }

  const blocks: string[] = [];
  const added: BibSyncPlan["added"] = [];
  const existing: BibSyncPlan["existing"] = [];
  const invalid: string[] = [];

  for (const item of items) {
    const doi = item.data?.DOI ? normalizeDoi(item.data.DOI) : "";
    const titleYear = titleYearOf(item.data?.title, getYear(item));

    const doiKey = doi ? byDoi.get(doi) : undefined;
    if (doiKey) {
      existing.push({ zoteroKey: item.key, bibKey: doiKey, reason: "doi" });
      continue;
    }
    const titleKey = !doi && titleYear ? byTitle.get(titleYear) : undefined;
    if (titleKey) {
      existing.push({ zoteroKey: item.key, bibKey: titleKey, reason: "title" });
      continue;
    }

    const bibKey = bibtexKey(item, usedKeys);
    const block = formatEntry(item, bibKey);
    if (!isValidBibKey(bibKey) || !isWellFormedEntry(block, bibKey)) {
      usedKeys.delete(bibKey);
      invalid.push(item.key);
      continue;
    }
    blocks.push(block);
    added.push({ zoteroKey: item.key, bibKey });
    if (doi) {byDoi.set(doi, bibKey);}
    if (titleYear) {byTitle.set(titleYear, bibKey);}
  }

  if (blocks.length === 0) {
    return { append: "", added, existing, invalid };
  }

  const current = existingTexts[0] ?? "";
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  const body = blocks.join("\n\n").replace(/\n/g, eol) + eol;
  let lead = "";
  if (current.length > 0) {
    lead = current.endsWith(eol + eol) ? "" : current.endsWith(eol) ? eol : eol + eol;
  }
  return { append: lead + body, added, existing, invalid };
}
