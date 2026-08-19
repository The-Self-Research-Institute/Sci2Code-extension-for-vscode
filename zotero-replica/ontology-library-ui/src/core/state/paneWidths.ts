/**
 * Sidebar/details pane widths, persisted via plain localStorage (try/catch
 * for non-browser hosts) - a layout preference, independent of library data.
 */

export const SIDEBAR_MIN = 190;
export const SIDEBAR_MAX = 400;
export const SIDEBAR_DEFAULT = 220; // matches the previous fixed grid-template-columns width

export const DETAILS_MIN = 320; // narrowest width the 6-tab bar (Info…Related) still fits without wrapping
export const DETAILS_MAX = 560;
export const DETAILS_DEFAULT = 380;

export const MIDDLE_MIN = 380; // narrowest width the Title/Creator/Date/Type columns stay legible

const SIDEBAR_KEY = 'zotero-replica.library.sidebarWidth';
const DETAILS_KEY = 'zotero-replica.library.detailsWidth';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getStoredNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed)) return clamp(parsed, min, max);
  } catch {
    /* non-browser host */
  }
  return fallback;
}

function setStoredNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

export function getStoredSidebarWidth(): number {
  return getStoredNumber(SIDEBAR_KEY, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX);
}

export function setStoredSidebarWidth(width: number): void {
  setStoredNumber(SIDEBAR_KEY, clamp(width, SIDEBAR_MIN, SIDEBAR_MAX));
}

export function getStoredDetailsWidth(): number {
  return getStoredNumber(DETAILS_KEY, DETAILS_DEFAULT, DETAILS_MIN, DETAILS_MAX);
}

export function setStoredDetailsWidth(width: number): void {
  setStoredNumber(DETAILS_KEY, clamp(width, DETAILS_MIN, DETAILS_MAX));
}
