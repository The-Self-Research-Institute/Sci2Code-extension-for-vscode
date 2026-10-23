export function applyDelta(
  current: any[],
  changed: any[],
  deletedKeys: string[]
): any[] {
  const byKey = new Map<string, any>(current.map((item) => [item.key, item]));
  for (const key of deletedKeys) {
    byKey.delete(key);
  }
  for (const row of changed) {
    if (!row || typeof row.key !== "string" || !row.data) {
      continue;
    }
    if (row.data.deleted) {
      byKey.delete(row.key);
    } else {
      byKey.set(row.key, row);
    }
  }
  return Array.from(byKey.values());
}
