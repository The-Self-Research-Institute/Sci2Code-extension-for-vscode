import { useEffect, useState } from 'react';
import { computeTagCounts } from './tagCounts';
import { defaultTitleFor } from '../itemTypeOptions';
import { tagKey } from './tagNormalize';
import { getAuthStatus } from '../../api/authProvider';
import {
  listAllItemsFull,
  listAllTrashedItemsFull,
  createItems,
  putItem,
  deleteItems,
  removeItemFromCollection,
  addItemsToCollection,
} from '../../api/items';
import { listCollections, createCollections, putCollection, deleteCollection as deleteCollectionApi } from '../../api/collections';
import {
  listTagsWithVersion,
  renameTag as renameTagAcrossLibraryApi,
  deleteTags as deleteTagsAcrossLibraryApi,
} from '../../api/tags';
import { uploadAttachmentFile, downloadAttachmentFile } from '../../api/attachments';
import type { BinaryDownloadResult } from '../../api/transport';
import { ApiError } from '../../api/transport';
import type { LibraryOwner } from '../../api/libraryOwner';
import type { Collection, Creator, Group, Item, Tag } from '../../api/types';

export interface LibraryData {
  collections: Collection[];
  items: Item[];
  groups: Group[];
  tags: Tag[];
  loading: boolean;
  error: string | null;
  /** Whether a usable authenticated session was found - see api/authProvider.ts. */
  authAvailable: boolean;
  refresh: () => void;
  removeFromCollection: (itemKey: string, collectionKey: string) => Promise<void>;
  /** Sets the item's `deleted` flag (soft delete/Trash) via a version-guarded partial update. */
  moveToTrash: (itemKey: string) => Promise<void>;
  /** Irreversibly removes these items (batch DELETE) AND, recursively, every child (note/attachment) whose parentItem points to one of them. */
  permanentlyDeleteItems: (itemKeys: string[]) => void;
  /** Creates a blank item on the Dataserver. Resolves to the server-assigned key. */
  createItem: (itemType: string, collectionKey?: string) => Promise<string>;
  /** Creates a top-level note (itemType 'note', no parentItem) - appears in the main item list like any other item. */
  createStandaloneNote: () => Promise<string>;
  /** Sets the item's `deleted` flag back to false - the inverse of moveToTrash, same version-guarded PUT. */
  restoreFromTrash: (itemKey: string) => Promise<void>;
  /** Partial metadata update (title, date, DOI, ...) - one field at a time, matching the editable InfoTab's commit-on-blur pattern. */
  updateItemField: (itemKey: string, field: string, value: string) => void;
  /** Replaces the item's whole creators array (add/remove/reorder/edit all go through this). */
  updateItemCreators: (itemKey: string, creators: Creator[]) => void;
  /** Creates a collection on the Dataserver. Resolves to the server-assigned key. */
  createCollection: (name: string, parentKey: string | false) => Promise<string>;
  /** Renames a collection in place (version-guarded PUT). */
  renameCollection: (collectionKey: string, name: string) => void;
  /** Permanently removes a collection. Does not delete its member items. */
  deleteCollection: (collectionKey: string) => void;
  /** Adds already-existing top-level items to a collection. */
  addItemsToExistingCollection: (collectionKey: string, itemKeys: string[]) => void;
  /** Creates the imported items/collections (see core/import/) on the Dataserver - never touches existing data. */
  importItems: (newItems: Item[], newCollections?: Collection[]) => void;
  /** Adds a tag to an item; `type` follows Zotero's convention (0/absent = manual, 1 = automatic). No-op if the item already has that tag (case-insensitive). */
  addTag: (itemKey: string, tagName: string, type?: 0 | 1) => void;
  removeTag: (itemKey: string, tagName: string) => void;
  renameTag: (itemKey: string, oldName: string, newName: string) => void;
  /** Renames a tag on EVERY item in the library that carries it (the "Manage Tags" dialog's rename action) - distinct from the single-item renameTag above. Resolves the library's current version itself, then calls the dataserver's atomic bulk-rename endpoint. */
  renameTagAcrossLibrary: (oldName: string, newName: string) => Promise<void>;
  /** Deletes a tag from EVERY item in the library that carries it. */
  deleteTagAcrossLibrary: (tagName: string) => Promise<void>;
  /** Creates a child note item (itemType 'note') under parentItemKey. */
  addNote: (parentItemKey: string, text: string) => void;
  /** Replaces a note item's text content. */
  updateNote: (noteItemKey: string, text: string) => void;
  /**
   * Creates a child attachment item under parentItemKey, then uploads the
   * file's bytes to it via AttachmentController's GridFS-backed multipart
   * endpoint (proxied through the VS Code postMessage bridge - see
   * host/vscode/vscodeTransport.ts's uploadFile()). If the upload itself
   * fails, the attachment item is deleted again rather than left as an
   * empty, fileless attachment record.
   */
  addAttachment: (parentItemKey: string, file: { filename: string; contentType: string; base64Data: string }) => Promise<void>;
  /** Downloads an attachment's bytes (base64) via the same GridFS-backed endpoint. */
  downloadAttachment: (attachmentItemKey: string) => Promise<BinaryDownloadResult>;
  deleteChildItem: (itemKey: string) => void;
}

/**
 * Live, Dataserver-backed library data - replaces the earlier local-only
 * (localStorage) implementation now that persistent authentication exists
 * (see host/vscode/vscodeAuthProvider.ts, src/zoteroReplica/authSession.ts).
 * Every mutation re-fetches the authoritative item/collection list afterward
 * (`refresh()`) rather than optimistically merging - simpler and safer given
 * the Dataserver's own version-conflict semantics, appropriate for a
 * single-user desktop tool where the cost of one extra round-trip is
 * negligible.
 */
export function useLibraryData(): LibraryData {
  const [items, setItems] = useState<Item[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authAvailable, setAuthAvailable] = useState(false);
  const [owner, setOwner] = useState<LibraryOwner | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const auth = await getAuthStatus();
      if (cancelled) return;
      setAuthAvailable(auth.available);

      if (!auth.available || !auth.userId) {
        setOwner(null);
        setItems([]);
        setCollections([]);
        setLoading(false);
        return;
      }

      const currentOwner: LibraryOwner = { kind: 'users', id: auth.userId };
      setOwner(currentOwner);
      try {
        // The dataserver's plain /items listing deliberately EXCLUDES trashed
        // items (ItemService.listAll -> findByLibraryIdAndDeletedFalse -
        // matches real Zotero API semantics), and there is no single endpoint
        // that returns both. This app does all its My-Library/Trash
        // partitioning client-side by inspecting `data.deleted` (see App.tsx's
        // matchesSelection/trashedItems and Sidebar's trash count) - so
        // without also fetching /items/trash and merging it in here, trashed
        // items would never exist in this hook's `items` state at all: the
        // Trash view would always render empty and its count would never
        // move, even though the dataserver correctly persisted `deleted: true`.
        // listAllItemsFull/listAllTrashedItemsFull page through the entire
        // result set (see items.ts's drainAllPages) rather than a single
        // capped request, so sidebar counts, tag aggregation, and search all
        // see the complete library regardless of size.
        const [liveItems, liveTrashedItems, liveCollections] = await Promise.all([
          listAllItemsFull(currentOwner),
          listAllTrashedItemsFull(currentOwner),
          listCollections(currentOwner),
        ]);
        if (cancelled) return;
        setItems([...liveItems, ...liveTrashedItems]);
        setCollections(liveCollections);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'Failed to load your library from the Dataserver.');
        setItems([]);
        setCollections([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const tags = computeTagCounts(items);
  const refresh = () => setRefreshToken((n) => n + 1);

  function requireOwner(): LibraryOwner {
    if (!owner) throw new ApiError('Not logged in', 401);
    return owner;
  }

  const removeFromCollection = async (itemKey: string, collectionKey: string) => {
    const o = requireOwner();
    await removeItemFromCollection(o, collectionKey, itemKey);
    refresh();
  };

  const moveToTrash = async (itemKey: string) => {
    const o = requireOwner();
    const current = items.find((it) => it.key === itemKey);
    if (!current) return;
    await putItem(o, itemKey, { deleted: true }, current.version);
    refresh();
  };

  const restoreFromTrash = async (itemKey: string) => {
    const o = requireOwner();
    const current = items.find((it) => it.key === itemKey);
    if (!current) return;
    await putItem(o, itemKey, { deleted: false }, current.version);
    refresh();
  };

  const updateItemField = (itemKey: string, field: string, value: string) => {
    const o = requireOwner();
    const current = items.find((it) => it.key === itemKey);
    if (!current) return;
    void putItem(o, itemKey, { [field]: value }, current.version).then(refresh);
  };

  const updateItemCreators = (itemKey: string, creators: Creator[]) => {
    const o = requireOwner();
    const current = items.find((it) => it.key === itemKey);
    if (!current) return;
    void putItem(o, itemKey, { creators }, current.version).then(refresh);
  };

  const permanentlyDeleteItems = (itemKeys: string[]) => {
    const o = requireOwner();
    const toDelete = new Set<string>();
    const collect = (key: string) => {
      if (toDelete.has(key)) return;
      toDelete.add(key);
      for (const child of items) {
        if (child.data.parentItem === key) collect(child.key);
      }
    };
    itemKeys.forEach(collect);
    void deleteItems(o, Array.from(toDelete)).then(refresh);
  };

  const createItem = async (itemType: string, collectionKey?: string): Promise<string> => {
    const o = requireOwner();
    const title = defaultTitleFor(itemType);
    const collectionsList = collectionKey ? [collectionKey] : [];
    const report = await createItems(o, [{ itemType, title, creators: [], tags: [], collections: collectionsList }]);
    const created = report.successful['0'];
    if (!created) {
      const failure = report.failed['0'];
      throw new ApiError(failure?.message ?? 'Dataserver rejected the new item', failure?.code);
    }
    refresh();
    return created.key;
  };

  const createStandaloneNote = async (): Promise<string> => {
    const o = requireOwner();
    const report = await createItems(o, [{ itemType: 'note', note: '', title: '(empty note)' }]);
    const created = report.successful['0'];
    if (!created) {
      const failure = report.failed['0'];
      throw new ApiError(failure?.message ?? 'Dataserver rejected the new note', failure?.code);
    }
    refresh();
    return created.key;
  };

  const createCollection = async (name: string, parentKey: string | false): Promise<string> => {
    const o = requireOwner();
    const report = await createCollections(o, [{ name, parentCollection: parentKey }]);
    const created = report.successful['0'];
    if (!created) {
      const failure = report.failed['0'];
      throw new ApiError(failure?.message ?? 'Dataserver rejected the new collection', failure?.code);
    }
    refresh();
    return created.key;
  };

  const renameCollection = (collectionKey: string, name: string) => {
    const o = requireOwner();
    const current = collections.find((c) => c.key === collectionKey);
    if (!current) return;
    void putCollection(o, collectionKey, { name, parentCollection: current.data.parentCollection }, current.version).then(refresh);
  };

  const deleteCollection = (collectionKey: string) => {
    const o = requireOwner();
    void deleteCollectionApi(o, collectionKey).then(refresh);
  };

  const addItemsToExistingCollection = (collectionKey: string, itemKeys: string[]) => {
    const o = requireOwner();
    void addItemsToCollection(o, collectionKey, itemKeys).then(refresh);
  };

  /**
   * Creates collections first (to learn their server-assigned keys), then
   * remaps each imported item's `collections` references from the parser's
   * placeholder keys to the real ones before creating the items themselves -
   * both as single batch calls, not one request per record.
   */
  const importItems = (newItems: Item[], newCollections: Collection[] = []) => {
    const o = requireOwner();

    (async () => {
      const collectionKeyMap = new Map<string, string>();
      if (newCollections.length > 0) {
        const payloads = newCollections.map((c) => ({ name: c.data.name, parentCollection: c.data.parentCollection }));
        const report = await createCollections(o, payloads);
        newCollections.forEach((c, index) => {
          const created = report.successful[String(index)];
          if (created) collectionKeyMap.set(c.key, created.key);
        });
      }

      if (newItems.length > 0) {
        const itemPayloads = newItems.map((it) => {
          const { key: _key, version: _version, citationKey: _citationKey, collections: itemCollections, ...rest } = it.data;
          return { ...rest, collections: (itemCollections ?? []).map((k) => collectionKeyMap.get(k) ?? k) };
        });
        await createItems(o, itemPayloads);
      }

      refresh();
    })();
  };

  const addTag = (itemKey: string, tagName: string, type: 0 | 1 = 0) => {
    const o = requireOwner();
    const key = tagKey(tagName);
    if (!key) return;
    const current = items.find((it) => it.key === itemKey);
    if (!current) return;
    const existing = current.data.tags ?? [];
    if (existing.some((t) => tagKey(t.tag) === key)) return;
    void putItem(o, itemKey, { tags: [...existing, { tag: tagName.trim(), type }] }, current.version).then(refresh);
  };

  const removeTag = (itemKey: string, tagName: string) => {
    const o = requireOwner();
    const key = tagKey(tagName);
    const current = items.find((it) => it.key === itemKey);
    if (!current) return;
    const tags = (current.data.tags ?? []).filter((t) => tagKey(t.tag) !== key);
    void putItem(o, itemKey, { tags }, current.version).then(refresh);
  };

  const renameTag = (itemKey: string, oldName: string, newName: string) => {
    const o = requireOwner();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const current = items.find((it) => it.key === itemKey);
    if (!current) return;
    const tags = (current.data.tags ?? []).map((t) => (tagKey(t.tag) === tagKey(oldName) ? { ...t, tag: trimmed } : t));
    void putItem(o, itemKey, { tags }, current.version).then(refresh);
  };

  const renameTagAcrossLibrary = async (oldName: string, newName: string): Promise<void> => {
    const o = requireOwner();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const { libraryVersion } = await listTagsWithVersion(o, { limit: 1 });
    await renameTagAcrossLibraryApi(o, oldName, trimmed, libraryVersion ?? undefined);
    refresh();
  };

  const deleteTagAcrossLibrary = async (tagName: string): Promise<void> => {
    const o = requireOwner();
    const { libraryVersion } = await listTagsWithVersion(o, { limit: 1 });
    await deleteTagsAcrossLibraryApi(o, [tagName], libraryVersion ?? undefined);
    refresh();
  };

  const addNote = (parentItemKey: string, text: string): void => {
    const o = requireOwner();
    void createItems(o, [{ itemType: 'note', parentItem: parentItemKey, note: text, title: noteTitleFrom(text) }]).then(
      refresh,
    );
  };

  const updateNote = (noteItemKey: string, text: string) => {
    const o = requireOwner();
    const current = items.find((it) => it.key === noteItemKey);
    if (!current) return;
    void putItem(o, noteItemKey, { note: text, title: noteTitleFrom(text) }, current.version).then(refresh);
  };

  const addAttachment = async (
    parentItemKey: string,
    file: { filename: string; contentType: string; base64Data: string },
  ): Promise<void> => {
    const o = requireOwner();
    const report = await createItems(o, [
      { itemType: 'attachment', parentItem: parentItemKey, title: file.filename, linkMode: 'imported_file' },
    ]);
    const created = report.successful['0'];
    if (!created) {
      const failure = report.failed['0'];
      throw new ApiError(failure?.message ?? 'Dataserver rejected the new attachment item', failure?.code);
    }
    try {
      await uploadAttachmentFile(o, created.key, file, created.version);
    } catch (e) {
      // The item record was created but the upload failed - remove the now-orphaned, fileless attachment rather than leaving it behind.
      void deleteItems(o, [created.key]);
      throw e;
    }
    refresh();
  };

  const downloadAttachment = (attachmentItemKey: string): Promise<BinaryDownloadResult> => {
    const o = requireOwner();
    return downloadAttachmentFile(o, attachmentItemKey);
  };

  const deleteChildItem = (itemKey: string) => {
    const o = requireOwner();
    void deleteItems(o, [itemKey]).then(refresh);
  };

  return {
    items,
    collections,
    groups: [],
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
  };
}

/** First non-blank line of the note, truncated - mirrors how Zotero derives a note's pseudo-title from its content. */
function noteTitleFrom(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim().length > 0) ?? '';
  const trimmed = firstLine.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed || '(empty note)';
}
