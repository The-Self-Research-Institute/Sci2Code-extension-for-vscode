/**
 * Item types offered by the "+ Item" menu. Deliberately limited to what
 * dataserver's SchemaService actually validates (book, journalArticle,
 * webpage, report, thesis) - not the broader mock-only set used elsewhere
 * to demonstrate icons (conferencePaper, bookSection). `note`/`attachment`
 * are excluded here too: notes have no working content field yet, and a
 * real attachment needs a file to attach, not a blank metadata row.
 */
export interface ItemTypeOption {
  itemType: string;
  label: string;
}

export const CREATABLE_ITEM_TYPES: ItemTypeOption[] = [
  { itemType: 'book', label: 'Book' },
  { itemType: 'journalArticle', label: 'Journal Article' },
  { itemType: 'webpage', label: 'Web Page' },
  { itemType: 'thesis', label: 'Thesis' },
  { itemType: 'report', label: 'Report' },
];

export function defaultTitleFor(itemType: string): string {
  const option = CREATABLE_ITEM_TYPES.find((o) => o.itemType === itemType);
  return option ? `New ${option.label}` : 'New Item';
}
