import type { ImportFormat } from './types';

const FORMAT_LABELS: Record<ImportFormat, string> = {
  bibtex: 'BibTeX',
  ris: 'RIS',
  endnote: 'EndNote',
  csljson: 'CSL JSON',
  'zotero-rdf': 'Zotero RDF',
};

export function formatLabel(format: ImportFormat): string {
  return FORMAT_LABELS[format];
}

/**
 * Format detection per the spec: extension first, then content-sniffing as
 * a fallback (and to disambiguate .xml, which could be Zotero RDF or
 * something else entirely, and .json, which could be CSL-JSON or an
 * unrelated JSON file). Returns null - never a guess - when nothing
 * recognizable is found, so the caller can show a clear "unsupported" error.
 */
export function detectFormat(filename: string, content: string): ImportFormat | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';

  switch (ext) {
    case 'bib':
    case 'bibtex':
      return 'bibtex';
    case 'ris':
      return 'ris';
    case 'enw':
      return 'endnote';
    case 'csljson':
      return 'csljson';
    case 'rdf':
      return 'zotero-rdf';
    case 'xml':
      return looksLikeZoteroRdf(content) ? 'zotero-rdf' : null;
    case 'json':
      return looksLikeJson(content) ? 'csljson' : null;
    default:
      return sniffContent(content);
  }
}

function looksLikeZoteroRdf(content: string): boolean {
  return /<rdf:RDF[\s>]/.test(content) && /xmlns:z=|xmlns:bib=/.test(content);
}

function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('[') || trimmed.startsWith('{');
}

/** Used when the extension is missing or unrecognized - sniff by content shape. */
function sniffContent(content: string): ImportFormat | null {
  const trimmed = content.trim();
  if (looksLikeZoteroRdf(trimmed)) return 'zotero-rdf';
  if (/^@\w+\s*\{/.test(trimmed)) return 'bibtex';
  if (/^TY\s{0,2}-/m.test(trimmed)) return 'ris';
  if (/^%0\s/m.test(trimmed)) return 'endnote';
  if (looksLikeJson(trimmed)) return 'csljson';
  return null;
}
