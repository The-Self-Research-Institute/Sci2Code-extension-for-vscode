import { ImportParseError, type ImportedRecord } from './types';

/**
 * EndNote "tagged" / "refer" format parser (.enw) - `%X value` per line,
 * records separated by one or more blank lines.
 */
const ENDNOTE_TYPE_MAP: Record<string, string> = {
  'journal article': 'journalArticle',
  'magazine article': 'journalArticle',
  'newspaper article': 'journalArticle',
  book: 'book',
  'book section': 'bookSection',
  'conference paper': 'conferencePaper',
  'conference proceedings': 'conferencePaper',
  thesis: 'thesis',
  report: 'report',
  'web page': 'webpage',
  'electronic article': 'journalArticle',
  generic: 'report',
};

const LINE_RE = /^%([0-9A-Za-z@!])\s?(.*)$/;

interface RawRecord {
  fields: Map<string, string[]>;
}

export function parseEndnote(content: string): ImportedRecord[] {
  const records = extractRecords(content);
  if (records.length === 0) {
    throw new ImportParseError('No EndNote tagged records found (expected "%0 ..." blocks).');
  }
  return records.map(recordToImported);
}

function extractRecords(content: string): RawRecord[] {
  const lines = content.split(/\r\n|\r|\n/);
  const records: RawRecord[] = [];
  let current: Map<string, string[]> | null = null;
  let lastTag: string | null = null;

  const flush = () => {
    if (current && current.size > 0) records.push({ fields: current });
    current = null;
    lastTag = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const match = LINE_RE.exec(line);
    if (match) {
      const [, tag, value] = match;
      if (!current) current = new Map();
      const existing = current.get(tag);
      if (existing) existing.push(value.trim());
      else current.set(tag, [value.trim()]);
      lastTag = tag;
    } else if (current && lastTag) {
      // Continuation line (no leading %tag) - append to the last field's most recent value.
      const existing = current.get(lastTag);
      if (existing) existing[existing.length - 1] = `${existing[existing.length - 1]} ${line.trim()}`;
    }
  }
  flush();
  return records;
}

function recordToImported(record: RawRecord): ImportedRecord {
  const f = record.fields;
  const first = (tag: string) => f.get(tag)?.[0];
  const all = (tag: string) => f.get(tag) ?? [];

  const typeRaw = (first('0') ?? '').trim().toLowerCase();
  const itemType = ENDNOTE_TYPE_MAP[typeRaw] ?? 'report';
  const isBookLike = itemType === 'book' || itemType === 'bookSection';

  const identifier = first('@');

  return {
    itemType,
    title: first('T'),
    creators: [...all('A').map((n) => nameToCreator(n, 'author')), ...all('E').map((n) => nameToCreator(n, 'editor'))],
    date: first('D'),
    publicationTitle: isBookLike ? undefined : first('J') ?? first('B'),
    bookTitle: isBookLike ? first('B') ?? first('T') : undefined,
    publisher: first('I'),
    place: first('C'),
    DOI: first('R'),
    ISBN: isBookLike ? identifier : undefined,
    ISSN: isBookLike ? undefined : identifier,
    url: first('U'),
    abstractNote: first('X'),
    volume: first('V'),
    issue: first('N'),
    pages: first('P'),
    edition: first('7'),
    language: first('G'),
    extra: first('1'),
    tags: all('K'),
  };
}

function nameToCreator(name: string, creatorType: string) {
  const trimmed = name.trim();
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map((s) => s.trim());
    return { creatorType, lastName: last, firstName: first || undefined };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { creatorType, lastName: trimmed };
  return { creatorType, firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}
