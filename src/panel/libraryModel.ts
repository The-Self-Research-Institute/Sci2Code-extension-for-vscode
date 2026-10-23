export type SortMode = "title" | "author" | "year" | "type";
export type Tab = "library" | "cited";

export interface PanelItem {
  key: string;
  title: string;
  authors: string;
  year: string;
  itemType: string;
  identifier: string;
  doi: string;
  url: string;
  collections: string[];
  tags: string[];
  needsReview: boolean;
  isFile: boolean;
  fileExt: string;
  unresolved?: boolean;
}

export interface CollectionOption {
  key: string;
  label: string;
}

export interface Filters {
  search: string;
  collection: string;
  tag: string;
  tab: Tab;
  sort: SortMode;
}

interface RawCollection {
  key: string;
  data: { name: string; parentCollection: string | false };
}

const NON_REFERENCE_TYPES = new Set(["note", "annotation"]);
const ZOTERO_KEY_PATTERN = /\b[A-Z0-9]{8}\b/g;

export const DEFAULT_FILTERS: Filters = {
  search: "",
  collection: "",
  tag: "",
  tab: "library",
  sort: "year",
};

export function isReference(raw: any): boolean {
  return !!raw?.data && !NON_REFERENCE_TYPES.has(raw.data.itemType);
}

function creatorName(c: any): string {
  return (c?.lastName || c?.name || "").trim();
}

export function formatAuthors(creators: any[] | undefined): string {
  const names = (creators || []).map(creatorName).filter(Boolean);
  if (names.length === 0) {
    return "";
  }
  if (names.length === 1) {
    return names[0];
  }
  if (names.length <= 3) {
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  }
  return `${names[0]} et al.`;
}

function plainTitle(raw: any): string {
  const title = String(raw.data.title || "").replace(/<\/?[^>]+(>|$)/g, "").trim();
  return title || String(raw.data.filename || "").trim() || "Untitled";
}

export function isUserTag(tag: string): boolean {
  return !tag.trim().startsWith("{");
}

function fileExtension(d: any): string {
  const name = String(d.filename || d.title || "").trim();
  return name.match(/\.([A-Za-z0-9]{2,6})$/)?.[1]?.toUpperCase() || "";
}

export function toPanelItem(raw: any): PanelItem {
  const d = raw.data;
  const isFile = d.itemType === "attachment";
  const doi = d.DOI ? String(d.DOI) : "";
  const identifier = doi
    ? `DOI: ${doi}`
    : String(d.archiveID || d.publicationTitle || d.url || "");
  return {
    key: raw.key,
    title: plainTitle(raw),
    authors: formatAuthors(d.creators),
    year: String(d.date || "").match(/\d{4}/)?.[0] || "",
    itemType: d.itemType || "document",
    identifier,
    doi,
    url: raw.links?.alternate?.href || d.url || (doi ? `https://doi.org/${doi}` : ""),
    collections: Array.isArray(d.collections) ? d.collections : [],
    needsReview: !String(d.title || "").trim(),
    isFile,
    fileExt: isFile ? fileExtension(d) : "",
    tags: (d.tags || []).map((t: any) => t?.tag).filter((t: any) => typeof t === "string" && isUserTag(t)),
  };
}

export function toPanelItems(rawItems: any[]): PanelItem[] {
  return (rawItems || []).filter(isReference).map(toPanelItem);
}

export function searchText(raw: any): string {
  const d = raw.data;
  return [
    d.title,
    ...(d.creators || []).map((c: any) => `${c.firstName || ""} ${c.lastName || c.name || ""}`),
    d.DOI,
    d.date,
    d.publicationTitle,
    d.itemType,
    ...(d.tags || []).map((t: any) => t?.tag),
  ]
    .filter(Boolean)
    .join(" \u0000 ")
    .toLowerCase();
}

export function collectionOptions(collections: RawCollection[]): CollectionOption[] {
  const byKey = new Map(collections.map((c) => [c.key, c]));
  const pathOf = (c: RawCollection): string => {
    const names = [c.data.name];
    const seen = new Set<string>([c.key]);
    let parent = c.data.parentCollection;
    while (parent && byKey.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      const p = byKey.get(parent)!;
      names.unshift(p.data.name);
      parent = p.data.parentCollection;
    }
    return names.join(" / ");
  };
  return collections
    .map((c) => ({ key: c.key, label: pathOf(c) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function collectionAndDescendants(collections: RawCollection[], key: string): Set<string> {
  const keys = new Set<string>([key]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of collections) {
      const parent = c.data.parentCollection;
      if (parent && keys.has(parent) && !keys.has(c.key)) {
        keys.add(c.key);
        grew = true;
      }
    }
  }
  return keys;
}

export function allTags(items: PanelItem[]): string[] {
  const tags = new Set<string>();
  for (const item of items) {
    item.tags.forEach((t) => tags.add(t));
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

export function extractCitedKeys(text: string, knownKeys: Set<string>): string[] {
  const seen = new Set<string>();
  for (const token of text.match(ZOTERO_KEY_PATTERN) || []) {
    if (knownKeys.has(token)) {
      seen.add(token);
    }
  }
  return Array.from(seen);
}

function compare(a: PanelItem, b: PanelItem, sort: SortMode): number {
  switch (sort) {
    case "author":
      return (
        (a.authors || "￿").localeCompare(b.authors || "￿") ||
        a.title.localeCompare(b.title)
      );
    case "year":
      return (Number(b.year) || 0) - (Number(a.year) || 0) || a.title.localeCompare(b.title);
    case "type":
      return a.itemType.localeCompare(b.itemType) || a.title.localeCompare(b.title);
    default:
      return a.title.localeCompare(b.title);
  }
}

export function filterItems(
  items: PanelItem[],
  searchIndex: Map<string, string>,
  collections: RawCollection[],
  filters: Filters,
  citedKeys: Set<string>,
  externalMatches: Set<string> = new Set()
): PanelItem[] {
  const term = filters.search.trim().toLowerCase();
  const wanted = filters.collection
    ? collectionAndDescendants(collections, filters.collection)
    : undefined;

  return items
    .filter((item) => {
      if (filters.tab === "cited" && !citedKeys.has(item.key)) {
        return false;
      }
      if (wanted && !item.collections.some((k) => wanted.has(k))) {
        return false;
      }
      if (filters.tag && !item.tags.includes(filters.tag)) {
        return false;
      }
      if (
        term &&
        !externalMatches.has(item.key) &&
        !(searchIndex.get(item.key) || "").includes(term)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => compare(a, b, filters.sort));
}

export interface UnresolvedCitation {
  key: string;
  title: string;
  doi: string;
  url: string;
}

const CITATION_ID_PATTERN = /@ZoteroArticleIDs[ \t]+([A-Za-z0-9_]+)/g;
const MANUAL_KEY_PATTERN = /\bMANUAL_\d+\b/g;
const BLOCK_LOOKBEHIND = 600;
const BLOCK_LOOKAHEAD = 600;

function tagValue(block: string, tag: string): string {
  const match = block.match(new RegExp(`@${tag}[ \t]+([^\r\n]*)`));
  const value = match ? match[1].replace(/\s*\*\/\s*$/, "").trim() : "";
  return value && value !== "N/A" ? value : "";
}

export function findUnresolvedCitations(text: string, knownKeys: Set<string>): UnresolvedCitation[] {
  const found = new Map<string, UnresolvedCitation>();
  const candidates: Array<{ key: string; index: number }> = [];

  for (const m of text.matchAll(CITATION_ID_PATTERN)) {
    candidates.push({ key: m[1], index: m.index ?? 0 });
  }
  for (const m of text.matchAll(MANUAL_KEY_PATTERN)) {
    candidates.push({ key: m[0], index: m.index ?? 0 });
  }

  for (const { key, index } of candidates) {
    if (key === "N" || key === "A" || knownKeys.has(key) || found.has(key)) {
      continue;
    }
    const block = text.slice(
      Math.max(0, index - BLOCK_LOOKBEHIND),
      index + BLOCK_LOOKAHEAD
    );
    const start = block.lastIndexOf("/**", index - Math.max(0, index - BLOCK_LOOKBEHIND));
    const scoped = start >= 0 ? block.slice(start) : block;
    const end = scoped.indexOf("*/");
    const comment = end >= 0 ? scoped.slice(0, end + 2) : scoped;
    found.set(key, {
      key,
      title: tagValue(comment, "ZoteroArticleNames") || key,
      doi: tagValue(comment, "ZoteroDOI"),
      url: tagValue(comment, "ZoteroArticleURLs"),
    });
  }
  return Array.from(found.values());
}

export function unresolvedAsItems(
  unresolved: UnresolvedCitation[],
  filters: Filters
): PanelItem[] {
  if (filters.collection || filters.tag) {
    return [];
  }
  const term = filters.search.trim().toLowerCase();
  return unresolved
    .filter((u) => !term || `${u.title} ${u.key} ${u.doi}`.toLowerCase().includes(term))
    .map((u) => ({
      key: u.key,
      title: u.title,
      authors: "",
      year: "",
      itemType: "unresolved",
      identifier: `Citation key · ${u.key}`,
      doi: u.doi,
      url: u.url,
      collections: [],
      tags: [],
      needsReview: true,
      isFile: false,
      fileExt: "",
      unresolved: true,
    }));
}

export const PAGE_SIZE = 5;

export interface Page<T> {
  pending: number;
  items: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize = PAGE_SIZE,
  expectedTotal = 0
): Page<T> {
  const total = Math.max(items.length, expectedTotal);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(Number.isFinite(page) ? Math.floor(page) : 0, 0), pageCount - 1);
  const start = current * pageSize;
  const slice = items.slice(start, start + pageSize);
  const pending = Math.max(0, Math.min(pageSize, total - start) - slice.length);
  return {
    pending,
    items: slice,
    page: current,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
  };
}
