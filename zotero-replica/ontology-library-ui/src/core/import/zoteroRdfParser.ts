import { ImportParseError, type ImportedCreator, type ImportedRecord, type ImportedCollection } from './types';

/**
 * Zotero RDF/XML parser (.rdf, .xml when it's Zotero-flavored RDF - see
 * formatDetection.ts). Best-effort, disclosed scope: reads the item fields
 * Zotero's own RDF export actually populates (title, creators, container
 * title/volume/issue, identifiers, date, abstract, subjects-as-tags) and
 * z:Collection/dcterms:hasPart structure for collections. Does NOT
 * reconstruct notes, attachments, or arbitrary custom RDF - those are
 * silently skipped rather than guessed at. Matching is namespace-agnostic
 * (by localName) so it tolerates minor namespace/prefix differences across
 * Zotero versions, at the cost of being slightly less strict than a fully
 * namespace-aware reader.
 */

const RDF_TYPE_TO_ITEM_TYPE: Record<string, string> = {
  Article: 'journalArticle',
  Book: 'book',
  BookSection: 'bookSection',
  ConferenceProceedings: 'conferencePaper',
  Presentation: 'conferencePaper',
  Thesis: 'thesis',
  Report: 'report',
  Document: 'webpage',
  Webpage: 'webpage',
  Manuscript: 'report',
};

const SKIP_ITEM_TYPES = new Set(['attachment', 'note']);

export function parseZoteroRdf(content: string): { records: ImportedRecord[]; collections: ImportedCollection[] } {
  const doc = new DOMParser().parseFromString(content, 'application/xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new ImportParseError('This file is not well-formed XML/RDF.');
  }

  const root = doc.documentElement;
  if (!root || root.localName !== 'RDF') {
    throw new ImportParseError('This does not look like a Zotero RDF export (missing an <rdf:RDF> root element).');
  }

  const itemElements = Array.from(root.children).filter((el) => isItemElement(el));
  if (itemElements.length === 0) {
    throw new ImportParseError('No bibliographic items found in this RDF file.');
  }

  const aboutToIndex = new Map<string, number>();
  itemElements.forEach((el, index) => {
    const about = el.getAttribute('rdf:about') ?? el.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'about');
    if (about) aboutToIndex.set(about, index);
  });

  const records = itemElements.map(elementToRecord).filter((r): r is ImportedRecord => r !== null);
  const collections = extractCollections(root, aboutToIndex);

  if (records.length === 0) {
    throw new ImportParseError('This RDF file only contains notes/attachments/unsupported item types - nothing importable was found.');
  }

  return { records, collections };
}

function isItemElement(el: Element): boolean {
  if (el.localName === 'Collection') return false;
  const itemType = directChildText(el, 'itemType');
  if (itemType && SKIP_ITEM_TYPES.has(itemType)) return false;
  // A real Zotero item element either declares z:itemType, or is one of the bib:* item classes.
  return !!itemType || el.localName in RDF_TYPE_TO_ITEM_TYPE;
}

function directChild(el: Element, localName: string): Element | undefined {
  return Array.from(el.children).find((c) => c.localName === localName);
}

function directChildText(el: Element, localName: string): string | undefined {
  const child = directChild(el, localName);
  const text = child?.textContent?.trim();
  return text || undefined;
}

function descendantsByLocalName(el: Element, localName: string): Element[] {
  return Array.from(el.getElementsByTagName('*')).filter((e) => e.localName === localName);
}

function personToCreator(personEl: Element, creatorType: string): ImportedCreator {
  const surname = directChildText(personEl, 'surname');
  const given = directChildText(personEl, 'givenName');
  const literalName = directChildText(personEl, 'name');
  if (!surname && !given && literalName) return { creatorType, lastName: literalName };
  return { creatorType, firstName: given, lastName: surname };
}

function extractCreators(itemEl: Element, containerLocalName: string, creatorType: string): ImportedCreator[] {
  const container = directChild(itemEl, containerLocalName);
  if (!container) return [];
  return descendantsByLocalName(container, 'Person').map((p) => personToCreator(p, creatorType));
}

function extractIdentifiers(itemEl: Element): { DOI?: string; ISBN?: string; url?: string } {
  const result: { DOI?: string; ISBN?: string; url?: string } = {};
  for (const idEl of descendantsByLocalName(itemEl, 'identifier')) {
    const text = idEl.textContent?.trim() ?? '';
    if (!text) continue;
    if (/^10\.\S+/.test(text) || /doi/i.test(text)) result.DOI ??= text.replace(/^DOI:?\s*/i, '');
    else if (/isbn/i.test(text)) result.ISBN ??= text.replace(/^ISBN:?\s*/i, '');
    else if (/^https?:\/\//i.test(text)) result.url ??= text;
  }
  // Some exports nest the URL under dcterms:URI/rdf:value instead of plain text.
  if (!result.url) {
    const uriValue = descendantsByLocalName(itemEl, 'URI')[0];
    const value = uriValue ? descendantsByLocalName(uriValue, 'value')[0]?.textContent?.trim() : undefined;
    if (value) result.url = value;
  }
  return result;
}

function elementToRecord(itemEl: Element): ImportedRecord | null {
  const itemType = directChildText(itemEl, 'itemType') ?? RDF_TYPE_TO_ITEM_TYPE[itemEl.localName] ?? 'report';
  const isBookLike = itemType === 'book' || itemType === 'bookSection';

  const isPartOf = directChild(itemEl, 'isPartOf');
  const journal = isPartOf ? directChild(isPartOf, 'Journal') : undefined;
  const bookContainer = isPartOf ? directChild(isPartOf, 'Book') : undefined;

  const identifiers = extractIdentifiers(itemEl);
  const tags = descendantsByLocalName(itemEl, 'subject')
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean);

  return {
    itemType,
    title: directChildText(itemEl, 'title'),
    creators: [...extractCreators(itemEl, 'authors', 'author'), ...extractCreators(itemEl, 'editors', 'editor')],
    date: directChildText(itemEl, 'date'),
    publicationTitle: isBookLike ? undefined : journal ? directChildText(journal, 'title') : undefined,
    bookTitle: isBookLike ? (bookContainer ? directChildText(bookContainer, 'title') : undefined) : undefined,
    publisher: directChildText(itemEl, 'publisher'),
    DOI: identifiers.DOI,
    ISBN: identifiers.ISBN,
    url: identifiers.url ?? directChildText(itemEl, 'identifier'),
    abstractNote: directChildText(itemEl, 'description'),
    volume: journal ? directChildText(journal, 'volume') : undefined,
    issue: journal ? directChildText(journal, 'number') : undefined,
    tags,
  };
}

function extractCollections(root: Element, aboutToIndex: Map<string, number>): ImportedCollection[] {
  const collectionElements = Array.from(root.children).filter((el) => el.localName === 'Collection');
  return collectionElements
    .map((el) => {
      const name = directChildText(el, 'title') ?? 'Imported Collection';
      const memberIndexes = descendantsByLocalName(el, 'hasPart')
        .map((partEl) => {
          const resource =
            partEl.getAttribute('rdf:resource') ?? partEl.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'resource');
          return resource ? aboutToIndex.get(resource) : undefined;
        })
        .filter((idx): idx is number => idx !== undefined);
      return { name, memberIndexes };
    })
    .filter((c) => c.memberIndexes.length > 0);
}
