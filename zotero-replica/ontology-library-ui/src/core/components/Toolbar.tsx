import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Search,
  Plus,
  RefreshCw,
  Wand2,
  FileText,
  FileUp,
  FileDown,
  FolderMinus,
  Trash2,
  Undo2,
  Columns3,
  ChevronDown,
  LogOut,
  KeyRound,
  Settings2,
} from '../icons';
import { CREATABLE_ITEM_TYPES } from '../itemTypeOptions';

/**
 * Closes `onClose` on any mousedown outside every ref in `refs`, but only
 * while `active` - so the listener isn't even registered when the popover
 * is already closed (per-popover, not a single always-on global listener).
 * mousedown (not click) so the outside click that dismisses the popup can't
 * also race the popup's own item click handler, which fires on the
 * subsequent click/mouseup and still runs normally beforehand.
 */
function useClickAway(refs: Array<RefObject<HTMLElement | null>>, active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (refs.some((ref) => ref.current?.contains(e.target as Node))) return;
      onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [active, refs, onClose]);
}

export interface ColumnVisibility {
  creator: boolean;
  date: boolean;
  itemType: boolean;
}

interface ToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onImport: () => void;
  onRefresh: () => void;
  loading: boolean;
  busy: boolean;
  selectedCount: number;
  canCreate: boolean;
  createDisabledReason?: string;
  onCreateItem: (itemType: string) => void;
  onRequestNewCollection: () => void;
  canRemoveFromCollection: boolean;
  canMoveToTrash: boolean;
  onRemoveFromCollection: () => void;
  onMoveToTrash: () => void;
  /** True while viewing Trash - swaps in permanent-deletion controls in place of the create/move-to-trash cluster. */
  isTrashView: boolean;
  canDeletePermanently: boolean;
  onDeletePermanently: () => void;
  hasTrashedItems: boolean;
  onEmptyTrash: () => void;
  canRestore: boolean;
  onRestore: () => void;
  onCreateStandaloneNote: () => void;
  onExport: () => void;
  onManageTags: () => void;
  columns: ColumnVisibility;
  onToggleColumn: (column: keyof ColumnVisibility) => void;
  onLogout: () => void;
  onOpenApiKey: () => void;
}

/**
 * Layout/order mirrors Zotero's items-pane toolbar: New Item / Add by
 * Identifier / New Note / Import (creation cluster) -> Remove from
 * Collection / Move to Trash (membership cluster) -> Refresh. Column
 * picker sits at the far right, next to search, matching Zotero's
 * placement. Import (BibTeX/RIS/EndNote/CSL JSON/Zotero RDF, see
 * core/import/) is fully local/client-side; the remaining disabled buttons
 * genuinely need Dataserver support this phase doesn't add (DOI/ISBN
 * lookup, note content) and stay disabled with a tooltip explaining why.
 */
export function Toolbar({
  searchValue,
  onSearchChange,
  onImport,
  onRefresh,
  loading,
  busy,
  selectedCount,
  canCreate,
  createDisabledReason,
  onCreateItem,
  onRequestNewCollection,
  canRemoveFromCollection,
  canMoveToTrash,
  onRemoveFromCollection,
  onMoveToTrash,
  isTrashView,
  canDeletePermanently,
  onDeletePermanently,
  hasTrashedItems,
  onEmptyTrash,
  canRestore,
  onRestore,
  onCreateStandaloneNote,
  onExport,
  onManageTags,
  columns,
  onToggleColumn,
  onLogout,
  onOpenApiKey,
}: ToolbarProps) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const newItemRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  useClickAway([newItemRef], newItemOpen, () => setNewItemOpen(false));
  useClickAway([columnsRef], columnsOpen, () => setColumnsOpen(false));

  return (
    <header className="toolbar">
      <div className="toolbar__actions">
        <div className="toolbar__dropdown" ref={newItemRef}>
          <button
            type="button"
            className="toolbar__button toolbar__button--primary"
            title={canCreate ? 'New Item' : createDisabledReason}
            onClick={() => setNewItemOpen((o) => !o)}
            disabled={!canCreate || busy}
          >
            <Plus size={14} /> Item <ChevronDown size={11} />
          </button>
          {newItemOpen && (
            <div className="toolbar__dropdown-menu">
              {CREATABLE_ITEM_TYPES.map((option) => (
                <button
                  key={option.itemType}
                  type="button"
                  className="toolbar__dropdown-item"
                  onClick={() => {
                    setNewItemOpen(false);
                    onCreateItem(option.itemType);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="toolbar__button" title="Add Item by Identifier — requires Dataserver support (no DOI/ISBN lookup service)" disabled>
          <Wand2 size={14} />
        </button>
        <button
          type="button"
          className="toolbar__button"
          title={canCreate ? 'New Standalone Note' : createDisabledReason}
          onClick={onCreateStandaloneNote}
          disabled={!canCreate || busy}
        >
          <FileText size={14} />
        </button>
        <button type="button" className="toolbar__button" title="Import from File (BibTeX, RIS, EndNote, CSL JSON, Zotero RDF)" onClick={onImport}>
          <FileDown size={14} />
        </button>
        <button type="button" className="toolbar__button" title="Export Library or Selection (BibTeX, RIS, CSL JSON)" onClick={onExport}>
          <FileUp size={14} />
        </button>
        <button
          type="button"
          className="toolbar__button"
          title={canCreate ? 'New Collection' : createDisabledReason}
          onClick={onRequestNewCollection}
          disabled={!canCreate || busy}
        >
          <Plus size={14} /> Collection
        </button>

        <span className="toolbar__separator" />

        <button
          type="button"
          className="toolbar__button"
          title="Remove Item from Collection"
          onClick={onRemoveFromCollection}
          disabled={!canRemoveFromCollection || busy}
        >
          <FolderMinus size={14} />
        </button>
        {isTrashView ? (
          <button type="button" className="toolbar__button" title="Restore to Library" onClick={onRestore} disabled={!canRestore || busy}>
            <Undo2 size={14} />
          </button>
        ) : (
          <button type="button" className="toolbar__button" title="Move to Trash" onClick={onMoveToTrash} disabled={!canMoveToTrash || busy}>
            <Trash2 size={14} />
          </button>
        )}
        {isTrashView && (
          <>
            <button
              type="button"
              className="toolbar__button toolbar__button--danger"
              title="Permanently delete the selected item(s) - cannot be undone"
              onClick={onDeletePermanently}
              disabled={!canDeletePermanently || busy}
            >
              Delete Permanently
            </button>
            <button
              type="button"
              className="toolbar__button toolbar__button--danger"
              title="Permanently delete every item in Trash - cannot be undone"
              onClick={onEmptyTrash}
              disabled={!hasTrashedItems || busy}
            >
              Empty Trash
            </button>
          </>
        )}

        <span className="toolbar__separator" />

        <button type="button" className="toolbar__button" title="Refresh library" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'toolbar__spin' : undefined} />
        </button>
        {selectedCount > 0 && <span className="toolbar__selection-count">{selectedCount} selected</span>}
      </div>
      <div className="toolbar__right">
        <div className="toolbar__search-wrap">
          <Search size={14} className="toolbar__search-icon" />
          <input
            type="search"
            className="toolbar__search"
            placeholder="Search library..."
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="toolbar__columns" ref={columnsRef}>
          <button type="button" className="toolbar__button" title="Choose Columns" onClick={() => setColumnsOpen((o) => !o)}>
            <Columns3 size={14} />
          </button>
          {columnsOpen && (
            <div className="toolbar__columns-menu">
              <label>
                <input type="checkbox" checked={columns.creator} onChange={() => onToggleColumn('creator')} /> Creator
              </label>
              <label>
                <input type="checkbox" checked={columns.date} onChange={() => onToggleColumn('date')} /> Date
              </label>
              <label>
                <input type="checkbox" checked={columns.itemType} onChange={() => onToggleColumn('itemType')} /> Type
              </label>
            </div>
          )}
        </div>
        <button type="button" className="toolbar__button" title="Manage Tags" onClick={onManageTags}>
          <Settings2 size={14} />
        </button>
        <button type="button" className="toolbar__button" title="API Access - connect Sci2Code" onClick={onOpenApiKey}>
          <KeyRound size={14} />
        </button>
        <button type="button" className="toolbar__button" title="Log out of Zotero Replica" onClick={onLogout}>
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
