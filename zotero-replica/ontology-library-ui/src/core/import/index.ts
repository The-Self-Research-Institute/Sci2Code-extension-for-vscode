import { detectFormat, formatLabel } from './formatDetection';
import { parseBibtex } from './bibtexParser';
import { parseRis } from './risParser';
import { parseEndnote } from './endnoteParser';
import { parseCslJson, isLikelyCslJson } from './csljsonParser';
import { parseZoteroRdf } from './zoteroRdfParser';
import { ImportParseError, type ParsedImportResult } from './types';

export type { ImportedRecord, ImportedCreator, ImportedCollection, ParsedImportResult, ImportFormat } from './types';
export { ImportParseError } from './types';
export { formatLabel } from './formatDetection';

const SUPPORTED_EXTENSIONS = '.bib, .bibtex, .ris, .enw, .csljson, .json, .rdf, .xml';

/**
 * Parses a user-selected file's already-read text content into the
 * intermediate ImportedRecord shape. Never touches the network or any
 * backend - pure in-memory parsing, per the local-only import requirement.
 * Throws ImportParseError with a message safe to show directly in the UI.
 */
export function parseImportFile(filename: string, content: string): ParsedImportResult {
  const format = detectFormat(filename, content);
  if (!format) {
    throw new ImportParseError(
      `"${filename}" isn't a recognized bibliography format. Supported: ${SUPPORTED_EXTENSIONS}.`,
    );
  }

  switch (format) {
    case 'bibtex':
      return { format, formatLabel: formatLabel(format), records: parseBibtex(content), collections: [] };
    case 'ris':
      return { format, formatLabel: formatLabel(format), records: parseRis(content), collections: [] };
    case 'endnote':
      return { format, formatLabel: formatLabel(format), records: parseEndnote(content), collections: [] };
    case 'csljson': {
      const parsed = parseJsonSafely(content, filename);
      if (!isLikelyCslJson(parsed)) {
        throw new ImportParseError(
          `"${filename}" is valid JSON, but doesn't look like CSL-JSON (expected an array of items each with "id" and "type").`,
        );
      }
      return { format, formatLabel: formatLabel(format), records: parseCslJson(parsed), collections: [] };
    }
    case 'zotero-rdf': {
      const { records, collections } = parseZoteroRdf(content);
      return { format, formatLabel: formatLabel(format), records, collections };
    }
  }
}

function parseJsonSafely(content: string, filename: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new ImportParseError(`"${filename}" is not valid JSON.`);
  }
}
