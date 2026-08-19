import type { Item, Tag } from '../../api/types';

/**
 * Client-side tag aggregation for the local library (mirrors what
 * Dataserver's TagController computes server-side via a Mongo aggregation -
 * see api/tags.ts's listTags for the future Dataserver-backed equivalent).
 */
export function computeTagCounts(items: Item[]): Tag[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.data.deleted) continue;
    for (const t of it.data.tags ?? []) {
      counts.set(t.tag, (counts.get(t.tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, numItems]) => ({ tag, meta: { numItems } }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}
