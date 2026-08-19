import { useMemo, useRef, useState } from 'react';
import { Toolbar, type ColumnVisibility } from './components/Toolbar';
import { Sidebar, type SidebarSelection } from './components/Sidebar';
import { TagSelector } from './components/TagSelector';
import { ItemList, type SortField } from './components/ItemList';
import { ItemDetails } from './components/ItemDetails';
import { ResizeHandle } from './components/ResizeHandle';
import { Dialog } from './components/Dialog';
import { ImportDialog, type ImportSummary } from './components/ImportDialog';
import { useLibraryData } from './state/useLibraryData';
import {
  getStoredSidebarWidth,
  setStoredSidebarWidth,
  getStoredDetailsWidth,
  setStoredDetailsWidth,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  DETAILS_MIN,
  DETAILS_MAX,
  MIDDLE_MIN,
} from './state/paneWidths';
import type { Item } from '../api/types';
import './App.css';

function matchesSelection(item: Item, selection: SidebarSelection): boolean {
  if (item.data.deleted) return selection.type === 'trash';
  switch (selection.type) {
    case 'library':
      return item.library.type === 'user';
    case 'trash':
      return false;
    case 'collection':
      return !!item.data.collections?.includes(selection.key);
    case 'group':
      return item.library.type === 'group' && item.library.id === selection.id;
  }
}

function compareBy(field: SortField, a: Item, b: Item): number {
  switch (field) {
    case 'title':
      return String(a.data.title ?? '').localeCompare(String(b.data.title ?? ''));
    case 'creator': {
      const an = a.data.creators?.[0]?.lastName ?? '';
      const bn = b.data.creators?.[0]?.lastName ?? '';
      return an.localeCompare(bn);
    }
    case 'date':
      return String(a.data.date ?? '').localeCompare(String(b.data.date ?? ''));
    case 'itemType':
      return a.data.itemType.localeCompare(b.data.itemType);
  }
}

const DEFAULT_COLUMNS: ColumnVisibility = { creator: true, date: true, itemType: true };

export function App() {
  const {
    items,
    collections,
    groups,
    tags,
    loading,
    error,
    refresh,
    removeFromCollection,
    moveToTrash,
    createItem,
    createCollection,
    importItems,
    addTag,
    removeTag,
    renameTag,
  } = useLibraryData();

  const [selection, setSelection] = useState<SidebarSelection>({ type: 'library' });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columns, setColumns] = useState<ColumnVisibility>(DEFAULT_COLUMNS);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(getStoredSidebarWidth);
  const [detailsWidth, setDetailsWidth] = useState(getStoredDetailsWidth);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResultMessage, setImportResultMessage] = useState<string | null>(null);

  // Attachments (and, in the future, notes) are child items - Zotero's own
  // item list only ever shows top-level items, with children reachable via
  // the details pane instead. `items` (full set) is still passed down where
  // children/relations need resolving (ItemList's attachment badge, ItemDetails).
  const topLevelItems = useMemo(() => items.filter((it) => !it.data.parentItem), [items]);

  const visibleItems = useMemo(() => {
    let result = topLevelItems.filter((item) => matchesSelection(item, selection));

    if (activeTags.size > 0) {
      result = result.filter((item) => {
        const itemTags = new Set((item.data.tags ?? []).map((t) => t.tag));
        for (const t of activeTags) if (!itemTags.has(t)) return false;
        return true;
      });
    }

    if (searchValue.trim()) {
      const needle = searchValue.trim().toLowerCase();
      result = result.filter((item) => {
        const title = String(item.data.title ?? '').toLowerCase();
        const creators = (item.data.creators ?? []).map((c) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.toLowerCase()).join(' ');
        return title.includes(needle) || creators.includes(needle);
      });
    }

    const sorted = [...result].sort((a, b) => compareBy(sortField, a, b));
    if (sortDirection === 'desc') sorted.reverse();
    return sorted;
  }, [topLevelItems, selection, activeTags, searchValue, sortField, sortDirection]);

  const visibleKeys = useMemo(() => visibleItems.map((i) => i.key), [visibleItems]);
  const selectedItems = visibleItems.filter((item) => selectedKeys.has(item.key));

  const handleSelect = (nextSelection: SidebarSelection) => {
    setSelection(nextSelection);
    setSelectedKeys(new Set());
    setLastClickedIndex(null);
  };

  const handleToggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRowClick = (key: string, index: number, modifiers: { shiftKey: boolean; ctrlOrMeta: boolean }) => {
    if (modifiers.shiftKey && lastClickedIndex !== null) {
      const [start, end] = [lastClickedIndex, index].sort((a, b) => a - b);
      setSelectedKeys(new Set(visibleKeys.slice(start, end + 1)));
      return;
    }
    if (modifiers.ctrlOrMeta) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setLastClickedIndex(index);
      return;
    }
    setSelectedKeys(new Set([key]));
    setLastClickedIndex(index);
  };

  const handleToggleColumn = (column: keyof ColumnVisibility) => {
    setColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const handleSelectItem = (key: string) => {
    const target = items.find((it) => it.key === key);
    if (!target) return;
    if (target.data.deleted) setSelection({ type: 'trash' });
    else if (target.library.type === 'group') setSelection({ type: 'group', id: target.library.id as number });
    else setSelection({ type: 'library' });
    setSelectedKeys(new Set([key]));
    setLastClickedIndex(null);
  };

  // --- Pane resizing -------------------------------------------------------
  // Widths are mirrored into refs so drag-end can persist the final value to
  // localStorage without writing on every pointermove.
  const sidebarWidthRef = useRef(sidebarWidth);
  const detailsWidthRef = useRef(detailsWidth);
  const handleSidebarDrag = (deltaX: number) =>
    setSidebarWidth((w) => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w + deltaX));
      sidebarWidthRef.current = next;
      return next;
    });
  const handleSidebarDragEnd = () => setStoredSidebarWidth(sidebarWidthRef.current);
  // The details pane is anchored to the right edge, so dragging its left
  // border right (positive deltaX) should shrink it, not grow it.
  const handleDetailsDrag = (deltaX: number) =>
    setDetailsWidth((w) => {
      const next = Math.min(DETAILS_MAX, Math.max(DETAILS_MIN, w - deltaX));
      detailsWidthRef.current = next;
      return next;
    });
  const handleDetailsDragEnd = () => setStoredDetailsWidth(detailsWidthRef.current);

  // --- Toolbar write actions -------------------------------------------------
  const isTrashSelection = selection.type === 'trash';
  const createDisabledReason = isTrashSelection ? 'Cannot add to Trash - select My Library or a collection first' : undefined;
  const canCreate = !createDisabledReason;
  const canRemoveFromCollection = selection.type === 'collection' && selectedItems.length > 0;
  const canMoveToTrash = selection.type !== 'trash' && selectedItems.length > 0;

  const handleCreateItem = async (itemType: string) => {
    const collectionKey = selection.type === 'collection' ? selection.key : undefined;
    setBusy(true);
    setActionError(null);
    try {
      const key = await createItem(itemType, collectionKey);
      setSelectedKeys(new Set([key]));
      setLastClickedIndex(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to create item.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestNewCollection = () => {
    setNewCollectionName('');
    setNewCollectionOpen(true);
  };

  const handleConfirmNewCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    const parentKey = selection.type === 'collection' ? selection.key : false;
    setBusy(true);
    setActionError(null);
    try {
      const key = await createCollection(name, parentKey);
      setNewCollectionOpen(false);
      setSelection({ type: 'collection', key });
      setSelectedKeys(new Set());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to create collection.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveFromCollection = async () => {
    if (selection.type !== 'collection') return;
    setActionError(null);
    try {
      await Promise.all(selectedItems.map((item) => removeFromCollection(item.key, selection.key)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to remove item(s) from collection.');
    }
  };

  const handleMoveToTrash = async () => {
    setActionError(null);
    try {
      await Promise.all(selectedItems.map((item) => moveToTrash(item.key)));
      setSelectedKeys(new Set());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to move item(s) to trash.');
    } finally {
      setTrashConfirmOpen(false);
    }
  };

  const handleRequestImport = () => {
    setImportResultMessage(null);
    setImportOpen(true);
  };

  const handleConfirmImport = (summary: ImportSummary) => {
    importItems(summary.items, summary.collections);
    const parts = [`Imported ${summary.importedCount} item${summary.importedCount === 1 ? '' : 's'}`];
    if (summary.skippedDuplicateCount > 0) {
      parts.push(`Skipped ${summary.skippedDuplicateCount} duplicate${summary.skippedDuplicateCount === 1 ? '' : 's'}`);
    }
    setImportResultMessage(parts.join(' — '));
  };

  return (
    <div className="app-shell">
      <Toolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onImport={handleRequestImport}
        onRefresh={refresh}
        loading={loading}
        busy={busy}
        selectedCount={selectedItems.length}
        canCreate={canCreate}
        createDisabledReason={createDisabledReason}
        onCreateItem={handleCreateItem}
        onRequestNewCollection={handleRequestNewCollection}
        canRemoveFromCollection={canRemoveFromCollection}
        canMoveToTrash={canMoveToTrash}
        onRemoveFromCollection={handleRemoveFromCollection}
        onMoveToTrash={() => setTrashConfirmOpen(true)}
        columns={columns}
        onToggleColumn={handleToggleColumn}
      />
      {error && <div className="app-shell__banner app-shell__banner--error">{error}</div>}
      {actionError && <div className="app-shell__banner app-shell__banner--error">{actionError}</div>}
      {importResultMessage && (
        <div className="app-shell__banner app-shell__banner--info">
          {importResultMessage}
          <button type="button" className="app-shell__banner-dismiss" onClick={() => setImportResultMessage(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="app-shell__body">
        <div className="app-shell__nav app-shell__pane" style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN, maxWidth: SIDEBAR_MAX }}>
          <Sidebar collections={collections} groups={groups} items={topLevelItems} selection={selection} onSelect={handleSelect} />
          <TagSelector tags={tags} selected={activeTags} onToggle={handleToggleTag} onClear={() => setActiveTags(new Set())} />
        </div>
        <ResizeHandle onDrag={handleSidebarDrag} onDragEnd={handleSidebarDragEnd} />
        {loading ? (
          <div className="app-shell__loading app-shell__pane" style={{ minWidth: MIDDLE_MIN }}>
            Loading library…
          </div>
        ) : (
          <div className="app-shell__pane app-shell__list-pane" style={{ minWidth: MIDDLE_MIN }}>
            <ItemList
              items={visibleItems}
              allItems={items}
              selectedKeys={selectedKeys}
              onRowClick={handleRowClick}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              columns={columns}
            />
          </div>
        )}
        <ResizeHandle onDrag={handleDetailsDrag} onDragEnd={handleDetailsDragEnd} />
        <div className="app-shell__pane app-shell__details-pane" style={{ width: detailsWidth, minWidth: DETAILS_MIN, maxWidth: DETAILS_MAX }}>
          <ItemDetails
            selectedItems={selectedItems}
            collections={collections}
            allItems={items}
            onSelectItem={handleSelectItem}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            onRenameTag={renameTag}
          />
        </div>
      </div>

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          existingItems={items}
          currentCollectionKey={selection.type === 'collection' ? selection.key : undefined}
          onConfirm={handleConfirmImport}
        />
      )}

      {newCollectionOpen && (
        <Dialog title="New Collection" onClose={() => setNewCollectionOpen(false)}>
          <p className="dialog__hint">
            {selection.type === 'collection' ? 'Creating a subcollection of the selected collection.' : 'Creating a top-level collection.'}
          </p>
          <input
            type="text"
            className="dialog__input"
            autoFocus
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmNewCollection();
            }}
            placeholder="Collection name"
          />
          <div className="dialog__actions">
            <button type="button" className="toolbar__button" onClick={() => setNewCollectionOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="toolbar__button toolbar__button--primary"
              onClick={handleConfirmNewCollection}
              disabled={!newCollectionName.trim() || busy}
            >
              Create
            </button>
          </div>
        </Dialog>
      )}

      {trashConfirmOpen && (
        <Dialog title="Move to Trash" onClose={() => setTrashConfirmOpen(false)}>
          <p className="dialog__hint">
            Move {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'} to the Trash?
          </p>
          <div className="dialog__actions">
            <button type="button" className="toolbar__button" onClick={() => setTrashConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="toolbar__button toolbar__button--danger" onClick={handleMoveToTrash} disabled={busy}>
              Move to Trash
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
