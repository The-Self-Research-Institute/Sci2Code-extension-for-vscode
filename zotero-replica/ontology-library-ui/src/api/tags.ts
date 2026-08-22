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

/** Same as listTags(), but also resolves the library's current version - needed to version-guard a rename/delete right after loading the tag list for a "Manage Tags" UI. */
export async function listTagsWithVersion(
  owner: LibraryOwner,
  params?: TagQueryParams,
): Promise<{ tags: Tag[]; libraryVersion: number | null }> {
  const { data, libraryVersion } = await apiClient.getWithVersion<Tag[]>(`${ownerBase(owner)}/tags`, {
    params: params as Record<string, string | number>,
  });
  return { tags: data, libraryVersion };
}

/**
 * OR-list syntax per dataserver's TagController, e.g. "a || b || c".
 * Version-guarded against the library's own version (TagController requires
 * If-Unmodified-Since-Version - see TagServiceTest#deleteTags_withoutVersion_throws428).
 */
export function deleteTags(owner: LibraryOwner, tagNames: string[], ifUnmodifiedSinceVersion?: number): Promise<void> {
  return apiClient.delete<void>(`${ownerBase(owner)}/tags`, {
    params: { tag: tagNames.join(' || ') },
    headers:
      ifUnmodifiedSinceVersion !== undefined ? { 'If-Unmodified-Since-Version': String(ifUnmodifiedSinceVersion) } : undefined,
    expectEmptyBody: true,
  });
}

/** Renames a tag across every item in the library that carries it. Version-guarded against the library's own version. */
export function renameTag(
  owner: LibraryOwner,
  name: string,
  newName: string,
  ifUnmodifiedSinceVersion?: number,
): Promise<{ renamedCount: number }> {
  return apiClient.patch<{ renamedCount: number }>(
    `${ownerBase(owner)}/tags/${encodeURIComponent(name)}`,
    { newName },
    {
      headers:
        ifUnmodifiedSinceVersion !== undefined
          ? { 'If-Unmodified-Since-Version': String(ifUnmodifiedSinceVersion) }
          : undefined,
    },
  );
}