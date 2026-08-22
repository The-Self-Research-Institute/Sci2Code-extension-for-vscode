/**
 * Item types offered by the "+ Item" menu - kept in sync with every item
 * type dataserver's SchemaService actually validates (see SchemaService.java).
 * `note`/`attachment` are excluded here: they're created through their own
 * dedicated flows (Notes tab / Attachments tab), not a blank metadata row.
 */
export interface ItemTypeOption {
  itemType: string;
  label: string;
}

export const CREATABLE_ITEM_TYPES: ItemTypeOption[] = [
  { itemType: 'book', label: 'Book' },
  { itemType: 'bookSection', label: 'Book Section' },
  { itemType: 'journalArticle', label: 'Journal Article' },
  { itemType: 'magazineArticle', label: 'Magazine Article' },
  { itemType: 'newspaperArticle', label: 'Newspaper Article' },
  { itemType: 'conferencePaper', label: 'Conference Paper' },
  { itemType: 'webpage', label: 'Web Page' },
  { itemType: 'blogPost', label: 'Blog Post' },
  { itemType: 'thesis', label: 'Thesis' },
  { itemType: 'report', label: 'Report' },
  { itemType: 'document', label: 'Document' },
  { itemType: 'manuscript', label: 'Manuscript' },
  { itemType: 'letter', label: 'Letter' },
  { itemType: 'email', label: 'Email' },
  { itemType: 'interview', label: 'Interview' },
  { itemType: 'presentation', label: 'Presentation' },
  { itemType: 'dataset', label: 'Dataset' },
  { itemType: 'encyclopediaArticle', label: 'Encyclopedia Article' },
  { itemType: 'dictionaryEntry', label: 'Dictionary Entry' },
  { itemType: 'computerProgram', label: 'Computer Program' },
  { itemType: 'videoRecording', label: 'Video Recording' },
  { itemType: 'audioRecording', label: 'Audio Recording' },
  { itemType: 'podcast', label: 'Podcast' },
  { itemType: 'map', label: 'Map' },
  { itemType: 'patent', label: 'Patent' },
];

export function defaultTitleFor(itemType: string): string {
  const option = CREATABLE_ITEM_TYPES.find((o) => o.itemType === itemType);
  return option ? `New ${option.label}` : 'New Item';
}
