import type { Item } from '../../api/types';
import { isBookLike, strField, tagNames } from './exportFieldAccess';

/** Inverse of csljsonParser.ts's CSL_TYPE_MAP. */
const ITEM_TYPE_TO_CSL: Record<string, string> = {
  journalArticle: 'article-journal',
  book: 'book',
  bookSection: 'chapter',
  conferencePaper: 'paper-conference',
  thesis: 'thesis',
  report: 'report',
  webpage: 'webpage',
};

interface CslName {
  family?: string;
  given?: string;
  literal?: string;
}

function creatorToCslName(creator: { firstName?: string; lastName?: string }): CslName {
  if (creator.lastName && creator.firstName) return { family: creator.lastName, given: creator.firstName };
  return { literal: creator.lastName ?? creator.firstName ?? '' };
}

function toIssued(date: string | undefined): { 'date-parts': (number | string)[][] } | undefined {
  if (!date) return undefined;
  const parts = date.split('-').filter(Boolean).map((p) => (Number.isNaN(Number(p)) ? p : Number(p)));
  return parts.length > 0 ? { 'date-parts': [parts] } : undefined;
}

function itemToCsl(item: Item): Record<string, unknown> {
  const bookLike = isBookLike(item.data.itemType);
  const authors = (item.data.creators ?? []).filter((c) => c.creatorType === 'author').map(creatorToCslName);
  const editors = (item.data.creators ?? []).filter((c) => c.creatorType === 'editor').map(creatorToCslName);
  const tags = tagNames(item);

  const csl: Record<string, unknown> = {
    id: strField(item, 'citationKey') ?? item.key,
    type: ITEM_TYPE_TO_CSL[item.data.itemType] ?? 'document',
    title: strField(item, 'title'),
    'container-title': bookLike ? strField(item, 'bookTitle') ?? strField(item, 'publicationTitle') : strField(item, 'publicationTitle'),
    publisher: strField(item, 'publisher'),
    'publisher-place': strField(item, 'place'),
    DOI: strField(item, 'DOI'),
    ISBN: strField(item, 'ISBN'),
    ISSN: strField(item, 'ISSN'),
    URL: strField(item, 'url'),
    abstract: strField(item, 'abstractNote'),
    volume: strField(item, 'volume'),
    issue: strField(item, 'issue'),
    page: strField(item, 'pages'),
    edition: strField(item, 'edition'),
    language: strField(item, 'language'),
    note: strField(item, 'extra'),
    'citation-key': strField(item, 'citationKey'),
  };
  if (authors.length > 0) csl.author = authors;
  if (editors.length > 0) csl.editor = editors;
  const issued = toIssued(strField(item, 'date'));
  if (issued) csl.issued = issued;
  if (tags.length > 0) csl.keyword = tags.join(', ');

  // Drop undefined fields entirely rather than emitting `"field": null`/`undefined` noise.
  return Object.fromEntries(Object.entries(csl).filter(([, v]) => v !== undefined));
}

/** Serializes items to CSL-JSON (.json) - the inverse of csljsonParser.ts. Skips notes/attachments, which have no bibliographic representation. */
export function itemsToCslJson(items: Item[]): string {
  const records = items
    .filter((item) => item.data.itemType !== 'note' && item.data.itemType !== 'attachment')
    .map(itemToCsl);
  return JSON.stringify(records, null, 2);
}
