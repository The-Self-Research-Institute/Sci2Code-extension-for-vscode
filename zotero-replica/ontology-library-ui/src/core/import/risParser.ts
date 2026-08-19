import { ImportParseError, type ImportedRecord } from './types';

/**
 * RIS parser (.ris). One tag per line, `XX  - value`, records delimited by
 * a TY (start) / ER (end) pair - the format used by PubMed, EndNote's RIS
 * export, Zotero's own RIS export, Mendeley, etc.
 */
const RIS_TYPE_MAP: Record<string, string> = {
  JOUR: 'journalArticle',
  JFULL: 'journalArticle',
  MGZN: 'journalArticle',
  NEWS: 'journalArticle',
  BOOK: 'book',
  CHAP: 'bookSection',
  CONF: 'conferencePaper',
  CPAPER: 'conferencePaper',
  THES: 'thesis',
  RPRT: 'report',
  ELEC: 'webpage',
  WEB: 'webpage',
  ICOMM: 'webpage',
};

const LINE_RE = /^([A-Z][A-Z0-9])\s{0,2}-\s?(.*)$/;

interface RawRecord {
  fields: Map<string, string[]>;
}

export function parseRis(content: string): ImportedRecord[] {
  const records = extractRecords(content);
  if (records.length === 0) {
    throw new ImportParseError('No RIS records found (expected "TY  - ..." / "ER  - " blocks).');
  }
  return records.map(recordToImported);
}

function extractRecords(content: string): RawRecord[] {
  const lines = content.split(/\r\n|\r|\n/);
  const records: RawRecord[] = [];
  let current: Map<string, string[]> | null = null;
  let lastTag: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const match = LINE_RE.exec(line);

    if (match) {
      const [, tag, value] = match;
      if (tag === 'TY') {
        current = new Map();
        current.set('TY', [value.trim()]);
        lastTag = 'TY';
        continue;
      }
      if (!current) continue; // stray line before any TY - ignore
      if (tag === 'ER') {
        records.push({ fields: current });
        current = null;
        lastTag = null;
        continue;
      }
      const existing = current.get(tag);
      if (existing) existing.push(value.trim());
      else current.set(tag, [value.trim()]);
      lastTag = tag;
    } else if (current && lastTag) {
      // Continuation of a multi-line value (rare, but some exporters wrap long abstracts).
      const existing = current.get(lastTag);
      if (existing) existing[existing.length - 1] = `${existing[existing.length - 1]} ${line.trim()}`;
    }
  }
  return records;
}

function recordToImported(record: RawRecord): ImportedRecord {
  const f = record.fields;
  const first = (tag: string) => f.get(tag)?.[0];
  const all = (tag: string) => f.get(tag) ?? [];

  const type = first('TY') ?? '';
  const itemType = RIS_TYPE_MAP[type] ?? 'report';
  const isBookLike = itemType === 'book' || itemType === 'bookSection';

  const creators = [
    ...all('AU').concat(all('A1')).map((n) => nameToCreator(n, 'author')),
    ...all('A2').concat(all('ED')).map((n) => nameToCreator(n, 'editor')),
  ];

  const sn = first('SN');
  const sp = first('SP');
  const ep = first('EP');
  const pages = sp && ep ? `${sp}-${ep}` : sp;

  return {
    itemType,
    title: first('TI') ?? first('T1'),
    creators,
    date: first('PY') ?? first('Y1'),
    publicationTitle: isBookLike ? undefined : first('T2') ?? first('JO') ?? first('JF'),
    bookTitle: isBookLike ? first('T2') ?? first('BT') : undefined,
    publisher: first('PB'),
    place: first('CY'),
    DOI: first('DO'),
    ISBN: isBookLike ? sn : undefined,
    ISSN: isBookLike ? undefined : sn,
    url: first('UR') ?? first('L1') ?? first('L2'),
    abstractNote: first('AB') ?? first('N2'),
    volume: first('VL'),
    issue: first('IS'),
    pages,
    edition: first('ET'),
    language: first('LA'),
    citationKey: first('ID'),
    extra: first('N1'),
    tags: all('KW'),
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
