import { useState } from 'react';
import { Search, Plus, RefreshCw, Wand2, FileText, FileUp, FolderMinus, Trash2, Columns3, ChevronDown } from '../icons';
import { CREATABLE_ITEM_TYPES } from '../itemTypeOptions';

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
  columns: ColumnVisibility;
  onToggleColumn: (column: keyof ColumnVisibility) => void;
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
  columns,
  onToggleColumn,
}: ToolbarProps) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);

  return (
    <header className="toolbar">
      <div className="toolbar__actions">
        <div className="toolbar__dropdown">
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
        <button type="button" className="toolbar__button" title="New Standalone Note — requires Dataserver support (note content field is not functional)" disabled>
          <FileText size={14} />
        </button>
        <button type="button" className="toolbar__button" title="Import from File (BibTeX, RIS, EndNote, CSL JSON, Zotero RDF)" onClick={onImport}>
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
        <button type="button" className="toolbar__button" title="Move to Trash" onClick={onMoveToTrash} disabled={!canMoveToTrash || busy}>
          <Trash2 size={14} />
        </button>

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
        <div className="toolbar__columns">
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
      </div>
    </header>
  );
}
