/**
 * Dataserver URL resolution for the Library UI.
 *
 * The replica frontend talks directly to its own dataserver - there is no
 * gateway in front of it. The URL is injected at build time via
 * VITE_DATASERVER_URL (see vite.config.ts) and defaults to the local
 * dataserver's own port for standalone development.
 */

declare const __ZOTERO_REPLICA_CONFIG__: Record<string, string> | undefined;

const DEFAULT_DATASERVER_URL = 'http://localhost:9089';

function getConfig(): Record<string, string> | undefined {
  if (typeof __ZOTERO_REPLICA_CONFIG__ !== 'undefined' && __ZOTERO_REPLICA_CONFIG__) {
    return __ZOTERO_REPLICA_CONFIG__;
  }
  return typeof window !== 'undefined' ? (window as any).__ZOTERO_REPLICA_CONFIG__ : undefined;
}

/** Resolves the dataserver origin (no trailing slash). */
export function getDataserverUrl(): string {
  const config = getConfig();
  return config?.DATASERVER_URL || DEFAULT_DATASERVER_URL;
}
