/**
 * Shared tag-text normalization for import (autoTags.ts, parsers) and manual
 * tagging (ItemDetails' TagsTab). A single source of truth for what makes
 * two tag strings "the same tag" - keeps import-time dedup and UI-time
 * dedup from silently drifting apart.
 */

/** Trims and collapses internal whitespace; does NOT change case (case is cosmetic, preserved for display). */
export function cleanTagText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Case-insensitive identity key - "Machine Learning" and "MACHINE LEARNING" share this key. */
export function tagKey(tag: string): string {
  return cleanTagText(tag).toLowerCase();
}

export function isMeaningfulTag(tag: string): boolean {
  const cleaned = cleanTagText(tag);
  return cleaned.length >= 2;
}

/**
 * Merges any number of tag-string lists into one deduplicated list, keeping
 * the first-seen casing for each logical tag (so re-running auto-tagging,
 * or importing a file twice, never produces "Machine learning" next to
 * "machine Learning"). Empty/too-short entries are dropped.
 */
export function mergeTagLists(...lists: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list) {
      const cleaned = cleanTagText(raw);
      if (!isMeaningfulTag(cleaned)) continue;
      const key = tagKey(cleaned);
      if (!seen.has(key)) seen.set(key, cleaned);
    }
  }
  return Array.from(seen.values());
}
