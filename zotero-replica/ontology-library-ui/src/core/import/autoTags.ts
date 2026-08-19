import type { ImportedRecord } from './types';
import { cleanTagText, mergeTagLists } from '../state/tagNormalize';

/**
 * Deterministic, fully local tag generation for imported records - no
 * external AI/API calls. Deliberately conservative (a handful of tags per
 * item, not one per title word): explicit source keywords, the
 * publication/book venue, and short uppercase acronyms found in the
 * title/abstract (domain terms like "NLP", "OWL", "RDF" are usually far
 * more useful search handles than generic prose words).
 */

// Common short all-caps tokens that show up in real titles but aren't domain acronyms.
const ACRONYM_STOPWORDS = new Set([
  'THE', 'AND', 'FOR', 'WITH', 'FROM', 'INTO', 'ONTO', 'VIA', 'USA', 'UK',
  'NO', 'OK', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
]);

function extractAcronyms(text: string): string[] {
  const matches = text.match(/\b[A-Z]{2,6}\b/g) ?? [];
  return matches.filter((m) => !ACRONYM_STOPWORDS.has(m));
}

export function generateAutoTags(record: ImportedRecord): string[] {
  const venue = record.publicationTitle ?? record.bookTitle;
  const acronyms = extractAcronyms(`${record.title ?? ''} ${record.abstractNote ?? ''}`);
  const candidates = [...(venue ? [cleanTagText(venue)] : []), ...acronyms];
  return mergeTagLists(candidates);
}
