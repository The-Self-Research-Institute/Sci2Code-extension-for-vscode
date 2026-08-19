/**
 * Typed models mirroring the Dataserver's actual response envelopes.
 *
 * Field names/shapes are taken directly from dataserver's DTOs and controllers
 * (ItemResponseMapper, CollectionResponse, GroupResponse, SearchResponse,
 * TagResponse) - see the architecture audit for the source-of-truth mapping.
 * Do not add fields dataserver doesn't actually return.
 */

export type LibraryType = 'user' | 'group';

export interface LibraryRef {
  id: string | number;
  type: LibraryType;
}

export interface Creator {
  creatorType: string;
  firstName?: string;
  lastName?: string;
}

/**
 * `type` follows Zotero's own API convention: 0 (or absent) = manually
 * assigned, 1 = automatic (imported/machine-generated). Absent is treated
 * as manual throughout the UI, so existing items without this field keep
 * working unchanged.
 */
export interface ItemTag {
  tag: string;
  type?: 0 | 1;
}

/** itemType-dependent fields (title, date, url, DOI, ...) live alongside the fixed ones below. */
export interface ItemData {
  key: string;
  version: number;
  itemType: string;
  creators?: Creator[];
  tags?: ItemTag[];
  collections?: string[];
  relations?: Record<string, unknown>;
  parentItem?: string;
  deleted?: boolean;
  [field: string]: unknown;
}

export interface Item {
  key: string;
  version: number;
  library: LibraryRef;
  data: ItemData;
}

export interface CollectionData {
  key: string;
  version: number;
  name: string;
  parentCollection: string | false;
  relations: Record<string, unknown>;
}

export interface Collection {
  key: string;
  version: number;
  library: LibraryRef;
  data: CollectionData;
}

export type GroupVisibility = 'PUBLIC_OPEN' | 'PUBLIC_CLOSED' | 'PRIVATE';
export type LibraryEditing = 'ADMINS' | 'MEMBERS';
export type LibraryReading = 'MEMBERS' | 'ALL';
export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface GroupMember {
  email: string;
  role: GroupRole;
}

export interface Group {
  id: number;
  name: string;
  owner: string;
  type: GroupVisibility;
  libraryEditing: LibraryEditing;
  libraryReading: LibraryReading;
  description?: string;
  url?: string;
  version: number;
  members: GroupMember[];
}

export interface SearchCondition {
  condition: string;
  operator: string;
  value: string;
}

export interface SearchData {
  key: string;
  version: number;
  name: string;
  conditions: SearchCondition[];
}

export interface SavedSearch {
  key: string;
  version: number;
  library: LibraryRef;
  data: SearchData;
}

export interface Tag {
  tag: string;
  meta: { numItems: number };
}

export interface WriteReportFailure {
  key?: string;
  code: number;
  message: string;
}

/** Batch write response shape (WriteReport.java) - keyed by request-array index. */
export interface WriteReport<T> {
  successful: Record<string, T>;
  unchanged: Record<string, T>;
  failed: Record<string, WriteReportFailure>;
}

export interface ItemQueryParams {
  q?: string;
  qmode?: 'contains' | 'startsWith';
  itemType?: string;
  tag?: string;
  since?: number;
  sort?: 'title' | 'dateAdded' | 'itemType' | 'dateModified';
  direction?: 'asc' | 'desc';
  start?: number;
  limit?: number;
}