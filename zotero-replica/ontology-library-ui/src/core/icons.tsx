import {
  BookOpen,
  Newspaper,
  Presentation,
  Globe,
  GraduationCap,
  FileBarChart2,
  BookMarked,
  StickyNote,
  Paperclip,
  FileQuestion,
  Library,
  Users,
  Folder,
  FolderOpen,
  FolderPlus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  Plus,
  RefreshCw,
  Tag as TagIcon,
  Tags,
  ArrowUp,
  ArrowDown,
  X,
  Wand2,
  FileText,
  FileUp,
  FolderMinus,
  Link2,
  Columns3,
  type LucideIcon,
} from 'lucide-react';

/**
 * Central icon mapping - reuses lucide-react, already a dependency
 * elsewhere in the project (ontology-vscode-extension). Deliberately
 * generic/library-themed, not Zotero's branding.
 *
 * Each item type also gets a subtle accent color (applied via a CSS class,
 * see App.css .item-icon--*) - Zotero itself color-codes its item-type
 * glyphs rather than leaving everything monochrome, so this mirrors that
 * without touching Zotero's actual palette/branding.
 */
const ITEM_TYPE_ICONS: Record<string, LucideIcon> = {
  book: BookOpen,
  bookSection: BookMarked,
  journalArticle: Newspaper,
  conferencePaper: Presentation,
  webpage: Globe,
  thesis: GraduationCap,
  report: FileBarChart2,
  note: StickyNote,
  attachment: Paperclip,
};

const ITEM_TYPE_COLOR_CLASS: Record<string, string> = {
  book: 'item-icon--book',
  bookSection: 'item-icon--book-section',
  journalArticle: 'item-icon--journal-article',
  conferencePaper: 'item-icon--conference-paper',
  webpage: 'item-icon--webpage',
  thesis: 'item-icon--thesis',
  report: 'item-icon--report',
  note: 'item-icon--note',
  attachment: 'item-icon--attachment',
};

export function getItemTypeIcon(itemType: string): LucideIcon {
  return ITEM_TYPE_ICONS[itemType] ?? FileQuestion;
}

export function getItemTypeColorClass(itemType: string): string {
  return ITEM_TYPE_COLOR_CLASS[itemType] ?? 'item-icon--default';
}

export {
  Library,
  Users,
  Folder,
  FolderOpen,
  FolderPlus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  Plus,
  RefreshCw,
  TagIcon,
  Tags,
  Paperclip,
  ArrowUp,
  ArrowDown,
  X,
  Wand2,
  FileText,
  FileUp,
  FolderMinus,
  Link2,
  Columns3,
};
