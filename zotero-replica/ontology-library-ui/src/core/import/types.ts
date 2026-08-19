/**
 * Intermediate shape every format parser produces, before mapToItem.ts maps
 * it onto the Replica's real Item model (api/types.ts). Keeping parsers
 * decoupled from Item means a parser only needs to know its own file
 * format, never the app's persistence/versioning concerns.
 */
export interface ImportedCreator {
  creatorType: string;
  firstName?: string;
  lastName?: string;
}

export interface ImportedRecord {
  itemType: string;
  title?: string;
  creators: ImportedCreator[];
  date?: string;
  publicationTitle?: string;
  bookTitle?: string;
  publisher?: string;
  place?: string;
  DOI?: string;
  ISBN?: string;
  ISSN?: string;
  url?: string;
  abstractNote?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  edition?: string;
  language?: string;
  citationKey?: string;
  extra?: string;
  /** Raw keyword/tag strings exactly as found in the source file, before normalization. */
  tags: string[];
}

export type ImportFormat = 'bibtex' | 'ris' | 'endnote' | 'csljson' | 'zotero-rdf';

export interface ParsedImportResult {
  format: ImportFormat;
  formatLabel: string;
  records: ImportedRecord[];
  /** Zotero RDF can carry real collection structure - see zoteroRdfParser.ts. Empty for every other format. */
  collections: ImportedCollection[];
}

export interface ImportedCollection {
  name: string;
  /** Indexes into ParsedImportResult.records for this collection's direct members. */
  memberIndexes: number[];
}

export class ImportParseError extends Error {}
