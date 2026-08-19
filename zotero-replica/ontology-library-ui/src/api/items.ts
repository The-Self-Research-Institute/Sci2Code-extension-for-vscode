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