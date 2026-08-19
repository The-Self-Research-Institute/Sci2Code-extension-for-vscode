import { ImportParseError, type ImportedCreator, type ImportedRecord } from './types';

/**
 * CSL-JSON parser (.csljson, and .json when it's recognized as CSL-JSON -
 * see formatDetection.ts). Accepts either a bare array of CSL items (the
 * common shape - Zotero's own "CSL JSON" export) or `{ "items": [...] }`.
 */
const CSL_TYPE_MAP: Record<string, string> = {
  'article-journal': 'journalArticle',
  'article-magazine': 'journalArticle',
  'article-newspaper': 'journalArticle',
  article: 'journalArticle',
  book: 'book',
  chapter: 'bookSection',
  'paper-conference': 'conferencePaper',
  thesis: 'thesis',
  report: 'report',
  webpage: 'webpage',
  post: 'webpage',
  'post-weblog': 'webpage',
  document: 'report',
  manuscript: 'report',
};

interface CslName {
  family?: string;
  given?: string;
  literal?: string;
}

interface CslItem {
  id?: string | number;
  type?: string;
  title?: string;
  'container-title'?: string;
  publisher?: string;
  'publisher-place'?: string;
  DOI?: string;
  ISBN?: string;
  ISSN?: string;
  URL?: string;
  abstract?: string;
  volume?: string;
  issue?: string;
  page?: string;
  edition?: string;
  language?: string;
  note?: string;
  'citation-key'?: string;
  keyword?: string | string[];
  author?: CslName[];
  editor?: CslName[];
  issued?: { 'date-parts'?: (number | string)[][]; raw?: string };
}

export function isLikelyCslJson(parsed: unknown): parsed is CslItem[] | { items: CslItem[] } {
  const items = extractItemsArray(parsed);
  if (!items || items.length === 0) return false;
  return items.every((item) => typeof item === 'object' && item !== null && 'type' in item && 'id' in item);
}

function extractItemsArray(parsed: unknown): CslItem[] | null {
  if (Array.isArray(parsed)) return parsed as CslItem[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)) {
    return (parsed as { items: CslItem[] }).items;
  }
  return null;
}

export function parseCslJson(parsed: unknown): ImportedRecord[] {
  const items = extractItemsArray(parsed);
  if (!items || items.length === 0) {
    throw new ImportParseError('No CSL-JSON items found (expected an array of objects with "id" and "type").');
  }
  return items.map(itemToRecord);
}

function cslNameToCreator(n: CslName, creatorType: string): ImportedCreator {
  if (n.literal) return { creatorType, lastName: n.literal };
  return { creatorType, firstName: n.given, lastName: n.family };
}

function extractDate(issued?: CslItem['issued']): string | undefined {
  if (!issued) return undefined;
  if (issued.raw) return issued.raw;
  const parts = issued['date-parts']?.[0];
  if (!parts) return undefined;
  return parts.filter((p) => p !== undefined && p !== null && p !== '').join('-');
}

function extractKeywords(keyword?: string | string[]): string[] {
  if (!keyword) return [];
  if (Array.isArray(keyword)) return keyword.map((k) => k.trim()).filter(Boolean);
  return keyword.split(/[;,]/).map((k) => k.trim()).filter(Boolean);
}

function itemToRecord(item: CslItem): ImportedRecord {
  const itemType = (item.type && CSL_TYPE_MAP[item.type]) ?? 'report';
  const isBookLike = itemType === 'book' || itemType === 'bookSection';

  return {
    itemType,
    title: item.title,
    creators: [
      ...(item.author ?? []).map((n) => cslNameToCreator(n, 'author')),
      ...(item.editor ?? []).map((n) => cslNameToCreator(n, 'editor')),
    ],
    date: extractDate(item.issued),
    publicationTitle: isBookLike ? undefined : item['container-title'],
    bookTitle: isBookLike ? item['container-title'] : undefined,
    publisher: item.publisher,
    place: item['publisher-place'],
    DOI: item.DOI,
    ISBN: item.ISBN,
    ISSN: item.ISSN,
    url: item.URL,
    abstractNote: item.abstract,
    volume: item.volume,
    issue: item.issue,
    pages: item.page,
    edition: item.edition,
    language: item.language,
    citationKey: item['citation-key'] ?? (typeof item.id === 'string' ? item.id : undefined),
    extra: item.note,
    tags: extractKeywords(item.keyword),
  };
}
