import { apiClient } from './client';
import { ownerBase, type LibraryOwner } from './libraryOwner';
import type { SavedSearch, SearchCondition } from './types';

const searchesPath = (owner: LibraryOwner) => `${ownerBase(owner)}/searches`;

export function listSearches(owner: LibraryOwner, since?: number): Promise<SavedSearch[]> {
  return apiClient.get<SavedSearch[]>(searchesPath(owner), { params: { since } });
}

export function putSearch(
  owner: LibraryOwner,
  key: string,
  data: { name: string; conditions: SearchCondition[] },
  ifUnmodifiedSinceVersion?: number,
): Promise<SavedSearch> {
  return apiClient.put<SavedSearch>(`${searchesPath(owner)}/${key}`, data, {
    headers:
      ifUnmodifiedSinceVersion !== undefined
        ? { 'If-Unmodified-Since-Version': String(ifUnmodifiedSinceVersion) }
        : undefined,
  });
}

export function deleteSearch(owner: LibraryOwner, key: string): Promise<void> {
  return apiClient.delete<void>(`${searchesPath(owner)}/${key}`, { expectEmptyBody: true });
}