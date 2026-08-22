import { apiClient } from './client';
import { ownerBase, type LibraryOwner } from './libraryOwner';
import type { Item, ItemQueryParams, WriteReport } from './types';

const itemsPath = (owner: LibraryOwner) => `${ownerBase(owner)}/items`;

export function listItems(owner: LibraryOwner, params?: ItemQueryParams): Promise<Item[]> {
  return apiClient.get<Item[]>(itemsPath(owner), { params: params as Record<string, string | number> });
}

export function listTopItems(owner: LibraryOwner, params?: ItemQueryParams): Promise<Item[]> {
  return apiClient.get<Item[]>(`${itemsPath(owner)}/top`, { params: params as Record<string, string | number> });
}

export function listTrashedItems(owner: LibraryOwner, params?: ItemQueryParams): Promise<Item[]> {
  return apiClient.get<Item[]>(`${itemsPath(owner)}/trash`, { params: params as Record<string, string | number> });
}

const DRAIN_PAGE_SIZE = 500;
/**
 * Safety backstop, not a real product limit - keeps a pathological library
 * from locking up the UI in an unbounded fetch loop. Far beyond any
 * realistic personal reference library; if ever hit, the library silently
 * showing fewer than its true item count is a known, disclosed edge case.
 */
const DRAIN_MAX_ITEMS = 20000;

/**
 * Repeatedly pages through a list endpoint (PaginationUtil's start/limit +
 * Total-Results header) until every matching item has been fetched, rather
 * than the previous hard single-request `limit` cap that silently hid any
 * item beyond it. Used for the main library/trash load, where sidebar counts,
 * tag aggregation, and search all need the complete set to be correct.
 */
async function drainAllPages(path: string, params?: Record<string, string | number | undefined>): Promise<Item[]> {
  const all: Item[] = [];
  let start = 0;
  for (;;) {
    const { data, totalResults } = await apiClient.getWithVersion<Item[]>(path, {
      params: { ...params, start, limit: DRAIN_PAGE_SIZE },
    });
    all.push(...data);
    const total = totalResults ?? all.length;
    if (data.length === 0 || all.length >= total || all.length >= DRAIN_MAX_ITEMS) break;
    start += DRAIN_PAGE_SIZE;
  }
  return all;
}

/** Same as listItems(), but fetches every matching item regardless of library size (see drainAllPages's doc comment). */
export function listAllItemsFull(owner: LibraryOwner, params?: ItemQueryParams): Promise<Item[]> {
  return drainAllPages(itemsPath(owner), params as Record<string, string | number | undefined>);
}

/** Same as listTrashedItems(), but fetches every trashed item regardless of trash size. */
export function listAllTrashedItemsFull(owner: LibraryOwner, params?: ItemQueryParams): Promise<Item[]> {
  return drainAllPages(`${itemsPath(owner)}/trash`, params as Record<string, string | number | undefined>);
}

export function listCollectionItems(
  owner: LibraryOwner,
  collectionKey: string,
  params?: ItemQueryParams,
): Promise<Item[]> {
  return apiClient.get<Item[]>(`${ownerBase(owner)}/collections/${collectionKey}/items`, {
    params: params as Record<string, string | number>,
  });
}

export function getItem(owner: LibraryOwner, key: string): Promise<Item> {
  return apiClient.get<Item>(`${itemsPath(owner)}/${key}`);
}

export function getItemChildren(owner: LibraryOwner, key: string): Promise<Item[]> {
  return apiClient.get<Item[]>(`${itemsPath(owner)}/${key}/children`);
}

/** Bulk create - dataserver assigns keys unless the caller supplies its own via `key`. */
export function createItems(owner: LibraryOwner, items: Record<string, unknown>[]): Promise<WriteReport<Item>> {
  return apiClient.post<WriteReport<Item>>(itemsPath(owner), items);
}

/** Create-or-update at a specific key (PUT semantics); pass ifUnmodifiedSinceVersion when updating. */
export function putItem(
  owner: LibraryOwner,
  key: string,
  item: Record<string, unknown>,
  ifUnmodifiedSinceVersion?: number,
): Promise<Item> {
  return apiClient.put<Item>(`${itemsPath(owner)}/${key}`, item, {
    headers:
      ifUnmodifiedSinceVersion !== undefined
        ? { 'If-Unmodified-Since-Version': String(ifUnmodifiedSinceVersion) }
        : undefined,
  });
}

/** Dataserver requires the version header on single-item delete (428 if missing). */
export function deleteItem(owner: LibraryOwner, key: string, ifUnmodifiedSinceVersion: number): Promise<void> {
  return apiClient.delete<void>(`${itemsPath(owner)}/${key}`, {
    headers: { 'If-Unmodified-Since-Version': String(ifUnmodifiedSinceVersion) },
    expectEmptyBody: true,
  });
}

export function deleteItems(owner: LibraryOwner, keys: string[]): Promise<void> {
  return apiClient.delete<void>(itemsPath(owner), {
    params: { itemKey: keys.join(',') },
    expectEmptyBody: true,
  });
}

/** Membership removal, not item deletion - matches dataserver's dedicated endpoint for this. */
export function removeItemFromCollection(owner: LibraryOwner, collectionKey: string, itemKey: string): Promise<void> {
  return apiClient.delete<void>(`${ownerBase(owner)}/collections/${collectionKey}/items/${itemKey}`, {
    expectEmptyBody: true,
  });
}

/** Adds existing top-level items to a collection (ItemService.addToCollection - rejects child items server-side). */
export function addItemsToCollection(owner: LibraryOwner, collectionKey: string, itemKeys: string[]): Promise<void> {
  return apiClient.post<void>(`${ownerBase(owner)}/collections/${collectionKey}/items`, itemKeys, { expectEmptyBody: true });
}