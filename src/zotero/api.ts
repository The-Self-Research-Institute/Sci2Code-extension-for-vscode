const ZOTERO_BASE_URI = "https://api.zotero.org";

export const getUserDetails = async (apiKey: string) => {
  try {
    console.log('[Sci2Code API] Fetching user details...');
    const response = await fetch(`${ZOTERO_BASE_URI}/keys/${apiKey}`, {
      method: "GET",
      headers: {
        "content-type": "application/json",
      },
    });
    console.log('[Sci2Code API] User details response status:', response.status);
    return response;
  } catch (error) {
    console.error('[Sci2Code API] Error fetching user details:', error);
    throw error;
  }
};

export const fetchZoteroItem = async (
  userId: string,
  itemKey: string,
  apiKey: string
) => {
  return await fetch(`${ZOTERO_BASE_URI}/users/${userId}/items/${itemKey}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
};

export const updateZoteroTags = async (
  userId: string,
  itemKey: string,
  apiKey: string,
  version: number,
  updatedTags: any
) => {
  return await fetch(`${ZOTERO_BASE_URI}/users/${userId}/items/${itemKey}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "If-Unmodified-Since-Version": version.toString(),
    },
    body: JSON.stringify({
      tags: updatedTags,
    }),
  });
};

export interface ZoteroCollection {
  key: string;
  data: { key: string; name: string; parentCollection: string | false };
}

export interface FetchAllOptions {
  pageSize?: number;
  maxRetries?: number;
  maxRestarts?: number;
  maxPages?: number;
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (loaded: number, total: number | undefined) => void;
}

export interface FetchAllResult<T> {
  items: T[];
  total: number | undefined;
  complete: boolean;
  error?: string;
}

export class ZoteroApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ZoteroApiError";
  }
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function describeStatus(status: number, statusText: string): string {
  if (status === 403 || status === 401) {
    return "Zotero rejected the API key (it is invalid or lacks library read access).";
  }
  if (status === 404) {
    return "Zotero library not found for this user.";
  }
  return `Zotero API error (${status}${statusText ? " " + statusText : ""}).`;
}

function waitFromHeaders(headers: Headers): number | undefined {
  const raw = headers.get("retry-after") ?? headers.get("backoff");
  if (raw === null) {
    return undefined;
  }
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

export async function fetchAllPages<T extends { key: string }>(
  path: string,
  apiKey: string,
  options: FetchAllOptions = {}
): Promise<FetchAllResult<T>> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 100, 1), 100);
  const maxRetries = options.maxRetries ?? 3;
  const maxRestarts = options.maxRestarts ?? 2;
  const maxPages = options.maxPages ?? 1000;
  const maxWaitMs = options.maxWaitMs ?? 30000;
  const sleep = options.sleep ?? defaultSleep;

  for (let restart = 0; ; restart++) {
    const byKey = new Map<string, T>();
    let total: number | undefined;
    let version: string | null = null;
    let versionChanged = false;
    let failure: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const start = page * pageSize;
      let response: Response | undefined;

      for (let attempt = 0; ; attempt++) {
        try {
          response = await fetch(
            `${ZOTERO_BASE_URI}/${path}?limit=${pageSize}&start=${start}`,
            { headers: { Authorization: `Bearer ${apiKey}` } }
          );
        } catch (e) {
          if (attempt >= maxRetries) {
            failure = `Network error: ${e instanceof Error ? e.message : String(e)}`;
            break;
          }
          await sleep(Math.min(1000 * 2 ** attempt, maxWaitMs));
          continue;
        }

        if (response.status === 429 || response.status === 503) {
          if (attempt >= maxRetries) {
            failure = "Zotero is rate limiting requests. Try again in a moment.";
            break;
          }
          const wait = waitFromHeaders(response.headers) ?? 1000 * 2 ** attempt;
          await sleep(Math.min(wait, maxWaitMs));
          continue;
        }
        break;
      }

      if (failure || !response) {
        break;
      }
      if (!response.ok) {
        const message = describeStatus(response.status, response.statusText);
        if (byKey.size === 0 && page === 0) {
          throw new ZoteroApiError(message, response.status);
        }
        failure = message;
        break;
      }

      const pageVersion = response.headers.get("last-modified-version");
      if (version !== null && pageVersion !== null && pageVersion !== version) {
        versionChanged = true;
        break;
      }
      version = pageVersion ?? version;

      const totalHeader = response.headers.get("total-results");
      if (totalHeader !== null && Number.isFinite(Number(totalHeader))) {
        total = Number(totalHeader);
      }

      let rows: T[];
      try {
        const body = await response.json();
        if (!Array.isArray(body)) {
          throw new Error("unexpected response shape");
        }
        rows = body as T[];
      } catch (e) {
        failure = `Could not read Zotero response: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }

      for (const row of rows) {
        if (row && typeof row.key === "string") {
          byKey.set(row.key, row);
        }
      }
      options.onProgress?.(byKey.size, total);

      const reachedTotal = total !== undefined && start + rows.length >= total;
      if (rows.length === 0 || rows.length < pageSize || reachedTotal) {
        return finish(byKey, total, undefined);
      }
    }

    if (versionChanged && restart < maxRestarts) {
      continue;
    }
    if (versionChanged) {
      failure = "The Zotero library kept changing while it was being loaded.";
    }
    if (!failure) {
      failure = "Stopped after reaching the maximum number of pages.";
    }
    if (byKey.size === 0) {
      throw new ZoteroApiError(failure);
    }
    return finish(byKey, total, failure);
  }
}

function finish<T>(
  byKey: Map<string, T>,
  total: number | undefined,
  error: string | undefined
): FetchAllResult<T> {
  const items = Array.from(byKey.values());
  const short = total !== undefined && items.length < total;
  return {
    items,
    total,
    complete: !error && !short,
    error:
      error ??
      (short ? `Loaded ${items.length} of ${total} items.` : undefined),
  };
}

export const getAllZoteroItems = (
  userId: string,
  apiKey: string,
  options?: FetchAllOptions
) => fetchAllPages<any>(`users/${userId}/items/top`, apiKey, options);

export const getZoteroCollectionList = (
  userId: string,
  apiKey: string,
  options?: FetchAllOptions
) =>
  fetchAllPages<ZoteroCollection>(`users/${userId}/collections`, apiKey, options);
