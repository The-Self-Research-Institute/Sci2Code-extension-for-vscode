import { apiClient } from './client';
import { ownerBase, type LibraryOwner } from './libraryOwner';
import type { Tag } from './types';

export interface TagQueryParams {
  tag?: string;
  q?: string;
  qmode?: 'contains' | 'startsWith';
  sort?: 'title' | 'numitems';
  direction?: 'asc' | 'desc';
  start?: number;
  limit?: number;
}

export function listTags(owner: LibraryOwner, params?: TagQueryParams): Promise<Tag[]> {
  return apiClient.get<Tag[]>(`${ownerBase(owner)}/tags`, { params: params as Record<string, string | number> });
}

/** OR-list syntax per dataserver's TagController, e.g. "a || b || c". */
export function deleteTags(owner: LibraryOwner, tagNames: string[]): Promise<void> {
  return apiClient.delete<void>(`${ownerBase(owner)}/tags`, {
    params: { tag: tagNames.join(' || ') },
    expectEmptyBody: true,
  });
}