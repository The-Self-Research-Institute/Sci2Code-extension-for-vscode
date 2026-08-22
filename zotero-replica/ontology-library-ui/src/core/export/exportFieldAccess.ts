import type { Item } from '../../api/types';

/** ItemData's fields are typed as `unknown` (schema-defined, itemType-dependent) - this narrows to a usable string. */
export function strField(item: Item, field: string): string | undefined {
  const value = item.data[field];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Zotero's convention: item.date `date` free-text (isBookLike decides journal vs. book title elsewhere - both share the same underlying `publicationTitle`/`bookTitle` fields already set by mapToItem/ItemService). */
export function isBookLike(itemType: string): boolean {
  return itemType === 'book' || itemType === 'bookSection';
}

/** "Last, First" - the inverse of every parser's nameToCreator/parseSingleName. */
export function creatorDisplayName(creator: { firstName?: string; lastName?: string }): string {
  if (creator.lastName && creator.firstName) return `${creator.lastName}, ${creator.firstName}`;
  return creator.lastName ?? creator.firstName ?? '';
}

/** Non-empty, de-duplicated tag names in stable order - format serializers don't care about manual vs. automatic (type), only import parsers set that distinction. */
export function tagNames(item: Item): string[] {
  return (item.data.tags ?? []).map((t) => t.tag).filter((t) => t.trim() !== '');
}
