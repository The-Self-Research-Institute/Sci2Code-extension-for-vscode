import type { Item, ItemData, ItemTag } from '../../api/types';
import { generateLocalKey } from '../state/localLibraryStore';
import { generateAutoTags } from './autoTags';
import { mergeTagLists } from '../state/tagNormalize';
import type { ImportedRecord } from './types';

const USER_LIB = { id: 'me', type: 'user' as const };

/**
 * Maps one parsed record onto the Replica's real Item model - no separate
 * "imported item" shape. Combines the source file's own keywords with our
 * deterministic auto-tags (deduped), all marked `type: 1` (automatic) so
 * the item details pane can visually distinguish them from tags the user
 * types themselves (type 0/absent) - see ItemDetails.tsx's TagsTab.
 */
export function mapToItem(record: ImportedRecord, options: { collectionKey?: string } = {}): Item {
  const key = generateLocalKey();
  const combinedTagNames = mergeTagLists(record.tags, generateAutoTags(record));
  const tags: ItemTag[] = combinedTagNames.map((tag) => ({ tag, type: 1 }));

  const data: ItemData = {
    key,
    version: 1,
    itemType: record.itemType,
    title: record.title ?? '(untitled)',
    creators: record.creators,
    tags,
    collections: options.collectionKey ? [options.collectionKey] : [],
    relations: {},
    deleted: false,
    date: record.date,
    publicationTitle: record.publicationTitle,
    bookTitle: record.bookTitle,
    publisher: record.publisher,
    place: record.place,
    DOI: record.DOI,
    ISBN: record.ISBN,
    ISSN: record.ISSN,
    url: record.url,
    abstractNote: record.abstractNote,
    volume: record.volume,
    issue: record.issue,
    pages: record.pages,
    edition: record.edition,
    language: record.language,
    citationKey: record.citationKey,
    extra: record.extra,
  };

  return {
    key,
    version: 1,
    library: USER_LIB,
    data,
  };
}
