import type { Item } from '../../api/types';
import { creatorDisplayName, isBookLike, strField, tagNames } from './exportFieldAccess';

/** Inverse of bibtexParser.ts's BIBTEX_TYPE_MAP - BibTeX has no native "webpage"/"presentation"/etc. type, so anything without a direct entry type falls back to `@misc`. */
const ITEM_TYPE_TO_BIBTEX: Record<string, string> = {
  journalArticle: 'article',
  book: 'book',
  bookSection: 'incollection',
  conferencePaper: 'inproceedings',
  thesis: 'phdthesis',
  report: 'techreport',
  manuscript: 'unpublished',
};

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function splitDate(date: string | undefined): { year?: string; month?: string } {
  if (!date) return {};
  const match = /^(\d{4})(?:-(\d{2}))?/.exec(date);
  if (!match) return { year: date };
  const [, year, monthNum] = match;
  const month = monthNum ? MONTH_NAMES[Number(monthNum) - 1] : undefined;
  return { year, month };
}

/** Wraps in braces so BibTeX readers don't lowercase/reflow the value; escapes literal braces already in the text. */
function bibValue(value: string): string {
  return `{${value.replace(/[{}]/g, '')}}`;
}

function citeKeyFor(item: Item, usedKeys: Set<string>): string {
  const explicit = strField(item, 'citationKey');
  if (explicit) return explicit;

  const creators = item.data.creators ?? [];
  const lastName = (creators[0]?.lastName ?? 'item').replace(/[^A-Za-z0-9]/g, '');
  const { year } = splitDate(strField(item, 'date'));
  const base = `${lastName || 'item'}${year ?? ''}` || item.key;

  let candidate = base;
  let suffix = 0;
  while (usedKeys.has(candidate)) {
    suffix += 1;
    candidate = `${base}${String.fromCharCode(96 + suffix)}`; // a, b, c, ...
  }
  usedKeys.add(candidate);
  return candidate;
}

function fieldLines(item: Item): string[] {
  const lines: string[] = [];
  const put = (name: string, value: string | undefined) => {
    if (value) lines.push(`  ${name} = ${bibValue(value)}`);
  };

  const bookLike = isBookLike(item.data.itemType);
  const authors = (item.data.creators ?? []).filter((c) => c.creatorType === 'author');
  const editors = (item.data.creators ?? []).filter((c) => c.creatorType === 'editor');
  if (authors.length > 0) put('author', authors.map(creatorDisplayName).join(' and '));
  if (editors.length > 0) put('editor', editors.map(creatorDisplayName).join(' and '));

  put('title', strField(item, 'title'));
  put('journal', bookLike ? undefined : strField(item, 'publicationTitle'));
  put('booktitle', bookLike ? strField(item, 'bookTitle') ?? strField(item, 'publicationTitle') : undefined);
  put('publisher', strField(item, 'publisher'));
  put('address', strField(item, 'place'));

  const { year, month } = splitDate(strField(item, 'date'));
  put('year', year);
  put('month', month);

  put('volume', strField(item, 'volume'));
  put('number', strField(item, 'issue'));
  put('pages', strField(item, 'pages'));
  put('edition', strField(item, 'edition'));
  put('doi', strField(item, 'DOI'));
  put('isbn', strField(item, 'ISBN'));
  put('issn', strField(item, 'ISSN'));
  put('url', strField(item, 'url'));
  put('abstract', strField(item, 'abstractNote'));
  put('language', strField(item, 'language'));
  put('note', strField(item, 'extra'));

  const tags = tagNames(item);
  if (tags.length > 0) put('keywords', tags.join(', '));

  return lines;
}

/** Serializes items to BibTeX (.bib) - the inverse of bibtexParser.ts. Skips notes/attachments, which have no bibliographic representation. */
export function itemsToBibtex(items: Item[]): string {
  const usedKeys = new Set<string>();
  const entries = items
    .filter((item) => item.data.itemType !== 'note' && item.data.itemType !== 'attachment')
    .map((item) => {
      const bibType = ITEM_TYPE_TO_BIBTEX[item.data.itemType] ?? 'misc';
      const citeKey = citeKeyFor(item, usedKeys);
      const lines = fieldLines(item);
      return `@${bibType}{${citeKey},\n${lines.join(',\n')}\n}`;
    });
  return entries.join('\n\n') + (entries.length > 0 ? '\n' : '');
}
