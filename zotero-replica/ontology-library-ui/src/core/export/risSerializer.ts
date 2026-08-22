import type { Item } from '../../api/types';
import { creatorDisplayName, isBookLike, strField, tagNames } from './exportFieldAccess';

/** Inverse of risParser.ts's RIS_TYPE_MAP - picks one representative RIS type per Zotero itemType (RIS's own map is many-to-one, e.g. JOUR/JFULL/MGZN/NEWS all import as journalArticle). */
const ITEM_TYPE_TO_RIS: Record<string, string> = {
  journalArticle: 'JOUR',
  book: 'BOOK',
  bookSection: 'CHAP',
  conferencePaper: 'CONF',
  thesis: 'THES',
  report: 'RPRT',
  webpage: 'WEB',
};

function risLines(item: Item): string[] {
  const lines: string[] = [];
  const put = (tag: string, value: string | undefined) => {
    if (value) lines.push(`${tag}  - ${value}`);
  };

  lines.push(`TY  - ${ITEM_TYPE_TO_RIS[item.data.itemType] ?? 'GEN'}`);

  const bookLike = isBookLike(item.data.itemType);
  for (const creator of item.data.creators ?? []) {
    put(creator.creatorType === 'editor' ? 'ED' : 'AU', creatorDisplayName(creator));
  }

  put('TI', strField(item, 'title'));
  put('PY', strField(item, 'date'));
  put(bookLike ? 'BT' : 'T2', bookLike ? strField(item, 'bookTitle') ?? strField(item, 'publicationTitle') : strField(item, 'publicationTitle'));
  put('PB', strField(item, 'publisher'));
  put('CY', strField(item, 'place'));
  put('DO', strField(item, 'DOI'));
  put('SN', bookLike ? strField(item, 'ISBN') : strField(item, 'ISSN'));
  put('UR', strField(item, 'url'));
  put('AB', strField(item, 'abstractNote'));
  put('VL', strField(item, 'volume'));
  put('IS', strField(item, 'issue'));

  const pages = strField(item, 'pages');
  if (pages) {
    const [sp, ep] = pages.split('-').map((p) => p.trim());
    put('SP', sp);
    if (ep) put('EP', ep);
  }

  put('ET', strField(item, 'edition'));
  put('LA', strField(item, 'language'));
  put('ID', strField(item, 'citationKey'));
  put('N1', strField(item, 'extra'));
  for (const tag of tagNames(item)) put('KW', tag);

  lines.push('ER  - ');
  return lines;
}

/** Serializes items to RIS (.ris) - the inverse of risParser.ts. Skips notes/attachments, which have no bibliographic representation. */
export function itemsToRis(items: Item[]): string {
  const records = items
    .filter((item) => item.data.itemType !== 'note' && item.data.itemType !== 'attachment')
    .map((item) => risLines(item).join('\n'));
  return records.join('\n\n') + (records.length > 0 ? '\n' : '');
}
