import { useMemo, useRef, useState } from 'react';
import { Toolbar, type ColumnVisibility } from './components/Toolbar';
import { Sidebar, type SidebarSelection } from './components/Sidebar';
import { TagSelector } from './components/TagSelector';
import { ItemList, type SortField } from './components/ItemList';
import { ItemDetails } from './components/ItemDetails';
import { ResizeHandle } from './components/ResizeHandle';
import { Dialog } from './components/Dialog';
import { ImportDialog, type ImportSummary } from './components/ImportDialog';
import { LoginForm } from './components/LoginForm';
import { ApiKeyDialog } from './components/ApiKeyDialog';
import { ManageTagsDialog } from './components/ManageTagsDialog';
import { ExportDialog } from './components/ExportDialog';
import { useLibraryData } from './state/useLibraryData';
import { logout as logoutAuthProvider } from '../api/authProvider';
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
    authAvailable,
    refresh,
    removeFromCollection,
    moveToTrash,
    restoreFromTrash,
    updateItemField,
    updateItemCreators,
    permanentlyDeleteItems,
    createItem,
    createStandaloneNote,
    createCollection,
    renameCollection,
    deleteCollection,
    addItemsToExistingCollection,
    importItems,
    addTag,
    removeTag,
    renameTag,
    renameTagAcrossLibrary,
    deleteTagAcrossLibrary,
    addNote,
    updateNote,
    addAttachment,
    downloadAttachment,
    deleteChildItem,
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
  const [permanentDeleteConfirmOpen, setPermanentDeleteConfirmOpen] = useState(false);
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResultMessage, setImportResultMessage] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [renamingCollectionKey, setRenamingCollectionKey] = useState<string | null>(null);
  const [renameCollectionName, setRenameCollectionName] = useState('');
  const [deleteCollectionConfirmKey, setDeleteCollectionConfirmKey] = useState<string | null>(null);

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

  const handleSelectAll = () => {
    setSelectedKeys(new Set(visibleKeys));
    setLastClickedIndex(visibleKeys.length - 1);
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
  const trashedItems = useMemo(() => topLevelItems.filter((it) => it.data.deleted), [topLevelItems]);
  const canDeletePermanently = isTrashSelection && selectedItems.length > 0;
  const hasTrashedItems = trashedItems.length > 0;
  const canRestore = isTrashSelection && selectedItems.length > 0;

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

  const handleRestore = async () => {
    setActionError(null);
    try {
      await Promise.all(selectedItems.map((item) => restoreFromTrash(item.key)));
      setSelectedKeys(new Set());
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to restore item(s) from Trash.');
    }
  };

  const handleCreateStandaloneNote = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const key = await createStandaloneNote();
      setSelectedKeys(new Set([key]));
      setLastClickedIndex(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to create note.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePermanently = () => {
    permanentlyDeleteItems(selectedItems.map((item) => item.key));
    setSelectedKeys(new Set());
    setPermanentDeleteConfirmOpen(false);
  };

  const handleEmptyTrash = () => {
    permanentlyDeleteItems(trashedItems.map((item) => item.key));
    setSelectedKeys(new Set());
    setEmptyTrashConfirmOpen(false);
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

  const handleLogout = async () => {
    await logoutAuthProvider();
    refresh();
  };

  // Persistent-session gate: while genuinely logged out (never on a day/week/
  // month timer - see useLibraryData's authAvailable), show only the login
  // screen. `loading` briefly covers the very first authStatus check so this
  // doesn't flash before a valid persisted session is found.
  if (!loading && !authAvailable) {
    return (
      <div className="app-shell app-shell--unauthenticated">
        <div className="app-shell__auth-prompt">
          <h1>Zotero Replica</h1>
          <p>Log in or create an account to access your library.</p>
          <button type="button" className="toolbar__button toolbar__button--primary" onClick={() => setLoginOpen(true)}>
            Log In / Register
          </button>
        </div>
        {loginOpen && <LoginForm onClose={() => setLoginOpen(false)} onAuthenticated={refresh} />}
      </div>
    );
  }

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
        isTrashView={isTrashSelection}
        canDeletePermanently={canDeletePermanently}
        onDeletePermanently={() => setPermanentDeleteConfirmOpen(true)}
        hasTrashedItems={hasTrashedItems}
        onEmptyTrash={() => setEmptyTrashConfirmOpen(true)}
        canRestore={canRestore}
        onRestore={handleRestore}
        onCreateStandaloneNote={handleCreateStandaloneNote}
        onExport={() => setExportOpen(true)}
        onManageTags={() => setManageTagsOpen(true)}
        columns={columns}
        onToggleColumn={handleToggleColumn}
        onLogout={handleLogout}
        onOpenApiKey={() => setApiKeyOpen(true)}
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
          <Sidebar
            collections={collections}
            groups={groups}
            items={topLevelItems}
            selection={selection}
            onSelect={handleSelect}
            onRequestRenameCollection={(key, currentName) => {
              setRenamingCollectionKey(key);
              setRenameCollectionName(currentName);
            }}
            onRequestDeleteCollection={(key) => setDeleteCollectionConfirmKey(key)}
          />
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
              onSelectAll={handleSelectAll}
              onDeleteKey={canMoveToTrash ? () => setTrashConfirmOpen(true) : undefined}
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
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteChildItem}
            onAddAttachment={addAttachment}
            onDownloadAttachment={downloadAttachment}
            onDeleteAttachment={deleteChildItem}
            onUpdateField={updateItemField}
            onUpdateCreators={updateItemCreators}
            onAddToCollection={addItemsToExistingCollection}
          />
        </div>
      </div>

      {apiKeyOpen && <ApiKeyDialog onClose={() => setApiKeyOpen(false)} />}

      {manageTagsOpen && (
        <ManageTagsDialog
          tags={tags}
          onRenameTag={renameTagAcrossLibrary}
          onDeleteTag={deleteTagAcrossLibrary}
          onClose={() => setManageTagsOpen(false)}
        />
      )}

      {exportOpen && (
        <ExportDialog
          selectedItems={selectedItems}
          visibleItems={visibleItems}
          libraryItems={topLevelItems.filter((it) => !it.data.deleted)}
          onClose={() => setExportOpen(false)}
        />
      )}

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

      {permanentDeleteConfirmOpen && (
        <Dialog title="Permanently Delete" onClose={() => setPermanentDeleteConfirmOpen(false)}>
          <p className="dialog__hint">
            Permanently delete the selected {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}?
          </p>
          <p className="dialog__hint dialog__hint--error">This action cannot be undone.</p>
          <div className="dialog__actions">
            <button type="button" className="toolbar__button" onClick={() => setPermanentDeleteConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="toolbar__button toolbar__button--danger" onClick={handleDeletePermanently}>
              Delete Permanently
            </button>
          </div>
        </Dialog>
      )}

      {renamingCollectionKey && (
        <Dialog title="Rename Collection" onClose={() => setRenamingCollectionKey(null)}>
          <input
            type="text"
            className="dialog__input"
            autoFocus
            value={renameCollectionName}
            onChange={(e) => setRenameCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameCollectionName.trim()) {
                renameCollection(renamingCollectionKey, renameCollectionName.trim());
                setRenamingCollectionKey(null);
              }
            }}
          />
          <div className="dialog__actions">
            <button type="button" className="toolbar__button" onClick={() => setRenamingCollectionKey(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="toolbar__button toolbar__button--primary"
              disabled={!renameCollectionName.trim()}
              onClick={() => {
                renameCollection(renamingCollectionKey, renameCollectionName.trim());
                setRenamingCollectionKey(null);
              }}
            >
              Rename
            </button>
          </div>
        </Dialog>
      )}

      {deleteCollectionConfirmKey && (
        <Dialog title="Delete Collection" onClose={() => setDeleteCollectionConfirmKey(null)}>
          <p className="dialog__hint">
            Delete "{collections.find((c) => c.key === deleteCollectionConfirmKey)?.data.name ?? ''}"? Items in it are not deleted, only the
            collection itself.
          </p>
          <div className="dialog__actions">
            <button type="button" className="toolbar__button" onClick={() => setDeleteCollectionConfirmKey(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="toolbar__button toolbar__button--danger"
              onClick={() => {
                deleteCollection(deleteCollectionConfirmKey);
                if (selection.type === 'collection' && selection.key === deleteCollectionConfirmKey) {
                  setSelection({ type: 'library' });
                }
                setDeleteCollectionConfirmKey(null);
              }}
            >
              Delete
            </button>
          </div>
        </Dialog>
      )}

      {emptyTrashConfirmOpen && (
        <Dialog title="Empty Trash" onClose={() => setEmptyTrashConfirmOpen(false)}>
          <p className="dialog__hint">
            All {trashedItems.length} item{trashedItems.length === 1 ? '' : 's'} currently in Trash will be permanently deleted.
          </p>
          <p className="dialog__hint dialog__hint--error">This action cannot be undone.</p>
          <div className="dialog__actions">
            <button type="button" className="toolbar__button" onClick={() => setEmptyTrashConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="toolbar__button toolbar__button--danger" onClick={handleEmptyTrash}>
              Empty Trash
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
