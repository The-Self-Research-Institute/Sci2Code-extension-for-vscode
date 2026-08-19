import { ImportParseError, type ImportedCreator, type ImportedRecord } from './types';

/**
 * BibTeX parser (.bib/.bibtex). Supports the standard `@type{citekey, field
 * = value, ...}` brace form used by every mainstream exporter (Zotero,
 * Mendeley, Google Scholar, EndNote's BibTeX export, ...). NOT supported,
 * disclosed: the legacy `@type(citekey, ...)` parenthesis form, `@string`
 * macro expansion/concatenation (`#`), and LaTeX accent/command decoding
 * (e.g. `{\"o}` is preserved literally rather than converted to "ö").
 */

const BIBTEX_TYPE_MAP: Record<string, string> = {
  article: 'journalArticle',
  book: 'book',
  booklet: 'book',
  inbook: 'bookSection',
  incollection: 'bookSection',
  inproceedings: 'conferencePaper',
  conference: 'conferencePaper',
  proceedings: 'book',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  techreport: 'report',
  manual: 'report',
  unpublished: 'report',
};

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

interface RawEntry {
  type: string;
  citeKey: string;
  fields: Map<string, string>;
}

export function parseBibtex(content: string): ImportedRecord[] {
  const entries = extractEntries(content);
  if (entries.length === 0) {
    throw new ImportParseError('No BibTeX entries found (expected "@type{key, field = value, ...}" blocks).');
  }
  return entries.map(entryToRecord);
}

function extractEntries(content: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const n = content.length;
  let i = 0;
  while (i < n) {
    if (content[i] === '@') {
      let j = i + 1;
      while (j < n && /[A-Za-z]/.test(content[j])) j++;
      const type = content.slice(i + 1, j).toLowerCase();
      let k = j;
      while (k < n && /\s/.test(content[k])) k++;
      if (content[k] === '{') {
        let depth = 1;
        let p = k + 1;
        while (p < n && depth > 0) {
          if (content[p] === '{') depth++;
          else if (content[p] === '}') depth--;
          p++;
        }
        const body = content.slice(k + 1, p - 1);
        if (type && !['comment', 'string', 'preamble'].includes(type)) {
          const entry = parseEntryBody(type, body);
          if (entry) entries.push(entry);
        }
        i = p;
        continue;
      }
    }
    i++;
  }
  return entries;
}

/** Splits on `separator` only outside `{...}` groups and outside a top-level `"..."` string. */
function splitTopLevel(s: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuotes = false;
  let current = '';
  for (const ch of s) {
    if (ch === '"' && depth === 0) inQuotes = !inQuotes;
    if (!inQuotes) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (ch === separator && depth === 0 && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function parseEntryBody(type: string, body: string): RawEntry | null {
  const chunks = splitTopLevel(body, ',').map((c) => c.trim()).filter((c) => c.length > 0);
  if (chunks.length === 0) return null;
  const citeKey = chunks[0];
  const fields = new Map<string, string>();
  for (let i = 1; i < chunks.length; i++) {
    const eq = chunks[i].indexOf('=');
    if (eq === -1) continue;
    const name = chunks[i].slice(0, eq).trim().toLowerCase();
    const value = unwrapBibtexValue(chunks[i].slice(eq + 1).trim());
    if (name) fields.set(name, value);
  }
  // No populated `field = value` pairs at all means this isn't a real entry -
  // just prose that happens to contain an "@word{...}" substring.
  if (fields.size === 0) return null;
  return { type, citeKey, fields };
}

function unwrapBibtexValue(value: string): string {
  let v = value.trim();
  if (v.startsWith('{') && v.endsWith('}')) v = v.slice(1, -1);
  else if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  // Strip any remaining literal braces - typically case-protection groups like "{S}emantic {W}eb".
  v = v.replace(/[{}]/g, '');
  return v.replace(/\s+/g, ' ').trim();
}

function parseNameList(raw: string | undefined, creatorType: string): ImportedCreator[] {
  if (!raw) return [];
  return raw
    .split(/\s+and\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== 'others')
    .map((name) => parseSingleName(name, creatorType));
}

function parseSingleName(name: string, creatorType: string): ImportedCreator {
  if (name.includes(',')) {
    const [last, first] = name.split(',').map((s) => s.trim());
    return { creatorType, lastName: last, firstName: first || undefined };
  }
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { creatorType, lastName: name };
  return { creatorType, firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

function splitKeywords(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

function normalizeMonth(month: string): string {
  const key = month.trim().toLowerCase().slice(0, 3);
  return MONTHS[key] ?? month.trim();
}

function entryToRecord(entry: RawEntry): ImportedRecord {
  const get = (name: string) => entry.fields.get(name);
  const year = get('year');
  const month = get('month');
  const date = year ? (month ? `${year}-${normalizeMonth(month)}` : year) : undefined;

  return {
    itemType: BIBTEX_TYPE_MAP[entry.type] ?? (get('url') ? 'webpage' : 'report'),
    title: get('title'),
    creators: [...parseNameList(get('author'), 'author'), ...parseNameList(get('editor'), 'editor')],
    date,
    publicationTitle: get('journal'),
    bookTitle: get('booktitle'),
    publisher: get('publisher'),
    place: get('address'),
    DOI: get('doi'),
    ISBN: get('isbn'),
    ISSN: get('issn'),
    url: get('url'),
    abstractNote: get('abstract'),
    volume: get('volume'),
    issue: get('number'),
    pages: get('pages')?.replace(/-{2,}/g, '-'),
    edition: get('edition'),
    language: get('language'),
    citationKey: entry.citeKey,
    extra: get('note'),
    tags: splitKeywords(get('keywords')),
  };
}
