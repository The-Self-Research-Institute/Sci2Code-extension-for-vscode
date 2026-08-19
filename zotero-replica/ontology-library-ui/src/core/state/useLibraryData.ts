import { useEffect, useState } from 'react';
import { computeTagCounts } from './tagCounts';
import { defaultTitleFor } from '../itemTypeOptions';
import { generateLocalKey, loadLocalCollections, loadLocalItems, saveLocalCollections, saveLocalItems } from './localLibraryStore';
import { tagKey } from './tagNormalize';
import type { Collection, Group, Item, Tag } from '../../api/types';

export interface LibraryData {
  collections: Collection[];
  items: Item[];
  groups: Group[];
  tags: Tag[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Local-only: removes the item's membership in this collection. */
  removeFromCollection: (itemKey: string, collectionKey: string) => Promise<void>;
  /** Local-only: sets the item's `deleted` flag. */
  moveToTrash: (itemKey: string) => Promise<void>;
  /** Local-only: creates a blank item with a locally-generated key. Resolves to the new item's key. */
  createItem: (itemType: string, collectionKey?: string) => Promise<string>;
  /** Local-only: creates a collection with a locally-generated key. Resolves to the new collection's key. */
  createCollection: (name: string, parentKey: string | false) => Promise<string>;
  /** Appends imported items/collections (see core/import/) to the existing library - never replaces it. */
  importItems: (newItems: Item[], newCollections?: Collection[]) => void;
  /** Adds a tag to an item; `type` follows Zotero's convention (0/absent = manual, 1 = automatic). No-op if the item already has that tag (case-insensitive). */
  addTag: (itemKey: string, tagName: string, type?: 0 | 1) => void;
  removeTag: (itemKey: string, tagName: string) => void;
  renameTag: (itemKey: string, oldName: string, newName: string) => void;
}

const USER_LIB = { id: 'me', type: 'user' as const };

/**
 * The library's only data source for this phase: this webview's own
 * localStorage (see localLibraryStore.ts). No Dataserver, no MongoDB, no
 * mock/demo data - the user starts with an empty library and everything
 * they create is persisted locally. Groups/saved-searches have no creation
 * UI yet, so they stay empty here; Sidebar already renders correctly with
 * an empty groups array.
 *
 * A future phase can reintroduce a Dataserver-backed mode behind this same
 * LibraryData shape (see api/*.ts, host/vscode/*, host/web/* - kept intact
 * but unused for now) without changing any component that consumes it.
 */
export function useLibraryData(): LibraryData {
  const [items, setItems] = useState<Item[]>(() => loadLocalItems());
  const [collections, setCollections] = useState<Collection[]>(() => loadLocalCollections());
  const [refreshToken, setRefreshToken] = useState(0);

  // refreshToken deliberately re-reads from storage rather than being a no-op,
  // so the Refresh button still does something meaningful (e.g. after the
  // user hand-edits localStorage) even though every mutation below already
  // updates React state directly.
  useEffect(() => {
    setItems(loadLocalItems());
    setCollections(loadLocalCollections());
  }, [refreshToken]);

  useEffect(() => {
    saveLocalItems(items);
  }, [items]);

  useEffect(() => {
    saveLocalCollections(collections);
  }, [collections]);

  const tags = computeTagCounts(items);

  const removeFromCollection = async (itemKey: string, collectionKey: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.key === itemKey
          ? { ...it, data: { ...it.data, collections: (it.data.collections ?? []).filter((c) => c !== collectionKey) } }
          : it,
      ),
    );
  };

  const moveToTrash = async (itemKey: string) => {
    setItems((prev) => prev.map((it) => (it.key === itemKey ? { ...it, data: { ...it.data, deleted: true } } : it)));
  };

  const createItem = async (itemType: string, collectionKey?: string): Promise<string> => {
    const title = defaultTitleFor(itemType);
    const key = generateLocalKey();
    const collectionsList = collectionKey ? [collectionKey] : [];
    const newItem: Item = {
      key,
      version: 1,
      library: USER_LIB,
      data: { key, version: 1, itemType, title, creators: [], tags: [], collections: collectionsList, relations: {}, deleted: false },
    };
    setItems((prev) => [newItem, ...prev]);
    return key;
  };

  const createCollection = async (name: string, parentKey: string | false): Promise<string> => {
    const key = generateLocalKey();
    const newCollection: Collection = {
      key,
      version: 1,
      library: USER_LIB,
      data: { key, version: 1, name, parentCollection: parentKey, relations: {} },
    };
    setCollections((prev) => [...prev, newCollection]);
    return key;
  };

  /** Prepends new items and appends new collections - existing data is never touched or reordered out. */
  const importItems = (newItems: Item[], newCollections: Collection[] = []) => {
    if (newCollections.length > 0) setCollections((prev) => [...prev, ...newCollections]);
    if (newItems.length > 0) setItems((prev) => [...newItems, ...prev]);
  };

  const addTag = (itemKey: string, tagName: string, type: 0 | 1 = 0) => {
    const key = tagKey(tagName);
    if (!key) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        const existing = it.data.tags ?? [];
        if (existing.some((t) => tagKey(t.tag) === key)) return it;
        return { ...it, data: { ...it.data, tags: [...existing, { tag: tagName.trim(), type }] } };
      }),
    );
  };

  const removeTag = (itemKey: string, tagName: string) => {
    const key = tagKey(tagName);
    setItems((prev) =>
      prev.map((it) =>
        it.key === itemKey
          ? { ...it, data: { ...it.data, tags: (it.data.tags ?? []).filter((t) => tagKey(t.tag) !== key) } }
          : it,
      ),
    );
  };

  const renameTag = (itemKey: string, oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        const tags = (it.data.tags ?? []).map((t) => (tagKey(t.tag) === tagKey(oldName) ? { ...t, tag: trimmed } : t));
        return { ...it, data: { ...it.data, tags } };
      }),
    );
  };

  return {
    items,
    collections,
    groups: [],
    tags,
    loading: false,
    error: null,
    refresh: () => setRefreshToken((n) => n + 1),
    removeFromCollection,
    moveToTrash,
    createItem,
    createCollection,
    importItems,
    addTag,
    removeTag,
    renameTag,
  };
}
