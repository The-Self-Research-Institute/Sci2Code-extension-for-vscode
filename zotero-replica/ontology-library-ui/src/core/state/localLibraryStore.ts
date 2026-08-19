import type { Collection, Item } from '../../api/types';

/**
 * Persistence for the local-only library (no Dataserver, no MongoDB).
 * Plain webview/browser localStorage, same mechanism already used for
 * paneWidths.ts and the (removed) mock/live toggle - swapping to a
 * Dataserver-backed store later is a change to this file only, not to
 * useLibraryData's callers.
 */
const ITEMS_KEY = 'zotero-replica.local.items';
const COLLECTIONS_KEY = 'zotero-replica.local.collections';

function load<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, value: T[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* non-browser host, or storage unavailable/full - local data just won't persist this write */
  }
}

export function loadLocalItems(): Item[] {
  return load<Item>(ITEMS_KEY);
}

export function saveLocalItems(items: Item[]): void {
  save(ITEMS_KEY, items);
}

export function loadLocalCollections(): Collection[] {
  return load<Collection>(COLLECTIONS_KEY);
}

export function saveLocalCollections(collections: Collection[]): void {
  save(COLLECTIONS_KEY, collections);
}

/** Client-side stand-in for dataserver's util/KeyGenerator.java (same charset, excludes visually ambiguous characters). */
export function generateLocalKey(): string {
  const alphabet = '23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';
  let key = '';
  for (let i = 0; i < 8; i++) key += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return key;
}
