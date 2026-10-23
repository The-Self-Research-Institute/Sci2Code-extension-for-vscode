export const CACHE_VERSION = 1;

export interface LibrarySnapshot {
  version: number;
  userId: string;
  username: string;
  syncedAt: number;
  libraryVersion: number;
  items: any[];
  collections: any[];
}

export function serializeSnapshot(snapshot: Omit<LibrarySnapshot, "version">): string {
  return JSON.stringify({ ...snapshot, version: CACHE_VERSION });
}

const hasKeyAndData = (row: any) =>
  !!row && typeof row.key === "string" && !!row.data && typeof row.data === "object";

export function parseSnapshot(text: string): LibrarySnapshot | null {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !raw ||
    raw.version !== CACHE_VERSION ||
    typeof raw.userId !== "string" ||
    !raw.userId ||
    !Array.isArray(raw.items) ||
    !Array.isArray(raw.collections)
  ) {
    return null;
  }
  return {
    version: CACHE_VERSION,
    userId: raw.userId,
    username: typeof raw.username === "string" ? raw.username : "",
    syncedAt: Number.isFinite(raw.syncedAt) ? raw.syncedAt : 0,
    libraryVersion: Number.isFinite(raw.libraryVersion) && raw.libraryVersion > 0 ? raw.libraryVersion : 0,
    items: raw.items.filter(hasKeyAndData),
    collections: raw.collections.filter(hasKeyAndData),
  };
}
