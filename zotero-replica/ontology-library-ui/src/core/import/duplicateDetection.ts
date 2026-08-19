import type { Item } from '../../api/types';
import type { ImportedRecord } from './types';

/**
 * Duplicate detection deliberately never trusts an imported record's own ID
 * (citation keys/RIS IDs/CSL ids differ across tools and files, so two
 * files describing the same paper will almost never share one). Instead it
 * matches on identity-bearing bibliographic fields, strongest first: DOI,
 * then ISBN, then URL, then title+first-author+year as a last resort
 * (title alone is too weak - many things share a title).
 */

function normalizeDoi(doi: string): string {
  return doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
}

function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[^0-9Xx]/g, '').toLowerCase();
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, '');
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(date?: string): string | undefined {
  return date?.match(/\d{4}/)?.[0];
}

export interface DuplicateMatch {
  item: Item;
  reason: string;
}

export function findDuplicate(existingItems: Item[], record: ImportedRecord): DuplicateMatch | undefined {
  const candidates = existingItems.filter((it) => !it.data.deleted);

  if (record.DOI) {
    const target = normalizeDoi(record.DOI);
    const match = candidates.find((it) => typeof it.data.DOI === 'string' && normalizeDoi(it.data.DOI) === target);
    if (match) return { item: match, reason: 'Same DOI' };
  }

  if (record.ISBN) {
    const target = normalizeIsbn(record.ISBN);
    const match = candidates.find((it) => typeof it.data.ISBN === 'string' && normalizeIsbn(it.data.ISBN) === target);
    if (match) return { item: match, reason: 'Same ISBN' };
  }

  if (record.url) {
    const target = normalizeUrl(record.url);
    const match = candidates.find((it) => typeof it.data.url === 'string' && normalizeUrl(it.data.url) === target);
    if (match) return { item: match, reason: 'Same URL' };
  }

  if (record.title) {
    const targetTitle = normalizeTitle(record.title);
    const targetYear = extractYear(record.date);
    const targetAuthor = record.creators.find((c) => c.creatorType === 'author')?.lastName?.toLowerCase().trim();

    if (targetTitle && targetYear && targetAuthor) {
      const match = candidates.find((it) => {
        const itTitle = typeof it.data.title === 'string' ? normalizeTitle(it.data.title) : '';
        if (itTitle !== targetTitle) return false;
        const itYear = extractYear(typeof it.data.date === 'string' ? it.data.date : undefined);
        if (itYear !== targetYear) return false;
        const itAuthor = it.data.creators?.find((c) => c.creatorType === 'author')?.lastName?.toLowerCase().trim();
        return itAuthor === targetAuthor;
      });
      if (match) return { item: match, reason: 'Same title, author, and year' };
    }
  }

  return undefined;
}
