import { apiClient } from './client';
import { ownerBase, type LibraryOwner } from './libraryOwner';
import type { Collection, WriteReport } from './types';

const collectionsPath = (owner: LibraryOwner) => `${ownerBase(owner)}/collections`;

/** Bulk create - dataserver assigns keys (KeyGenerator) when the caller doesn't supply one. */
export function createCollections(
  owner: LibraryOwner,
  collections: { name: string; parentCollection?: string | false }[],
): Promise<WriteReport<Collection>> {
  return apiClient.post<WriteReport<Collection>>(collectionsPath(owner), collections);
}

export function listCollections(owner: LibraryOwner, since?: number): Promise<Collection[]> {
  return apiClient.get<Collection[]>(collectionsPath(owner), { params: { since } });
}

export function listTopCollections(owner: LibraryOwner, since?: number): Promise<Collection[]> {
  return apiClient.get<Collection[]>(`${collectionsPath(owner)}/top`, { params: { since } });
}

export function listChildCollections(owner: LibraryOwner, parentKey: string, since?: number): Promise<Collection[]> {
  return apiClient.get<Collection[]>(`${collectionsPath(owner)}/${parentKey}/collections`, { params: { since } });
}

export function getCollection(owner: LibraryOwner, key: string): Promise<Collection> {
  return apiClient.get<Collection>(`${collectionsPath(owner)}/${key}`);
}

export function putCollection(
  owner: LibraryOwner,
  key: string,
  data: { name: string; parentCollection?: string | false },
  ifUnmodifiedSinceVersion?: number,
): Promise<Collection> {
  return apiClient.put<Collection>(`${collectionsPath(owner)}/${key}`, data, {
    headers:
      ifUnmodifiedSinceVersion !== undefined
        ? { 'If-Unmodified-Since-Version': String(ifUnmodifiedSinceVersion) }
        : undefined,
  });
}

export function deleteCollection(owner: LibraryOwner, key: string): Promise<void> {
  return apiClient.delete<void>(`${collectionsPath(owner)}/${key}`, { expectEmptyBody: true });
}