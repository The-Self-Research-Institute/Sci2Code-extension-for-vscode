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
  query?: Record<string, string>;
  onPage?: (items: any[], total: number | undefined) => void;
}

export interface FetchAllResult<T> {
  items: T[];
  total: number | undefined;
  complete: boolean;
  version?: number;
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
            `${ZOTERO_BASE_URI}/${path}?${new URLSearchParams({
              ...options.query,
              limit: String(pageSize),
              start: String(start),
            })}`,
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
      options.onPage?.(Array.from(byKey.values()), total);

      const reachedTotal = total !== undefined && start + rows.length >= total;
      if (rows.length === 0 || rows.length < pageSize || reachedTotal) {
        return finish(byKey, total, undefined, version);
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
    return finish(byKey, total, failure, version);
  }
}

function finish<T>(
  byKey: Map<string, T>,
  total: number | undefined,
  error: string | undefined,
  version: string | null
): FetchAllResult<T> {
  const items = Array.from(byKey.values());
  const short = total !== undefined && items.length < total;
  const parsedVersion = version === null ? NaN : Number(version);
  return {
    items,
    total,
    version: Number.isFinite(parsedVersion) ? parsedVersion : undefined,
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

export const createZoteroItem = async (
  userId: string,
  apiKey: string,
  data: Record<string, unknown>
): Promise<any> => {
  let response: Response;
  try {
    response = await fetch(`${ZOTERO_BASE_URI}/users/${userId}/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Zotero-Write-Token": crypto.randomUUID().replace(/-/g, ""),
      },
      body: JSON.stringify([data]),
    });
  } catch (e) {
    throw new ZoteroApiError(
      `Network error: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (response.status === 403) {
    throw new ZoteroApiError(
      "Your Zotero API key does not have write access to your library.",
      403
    );
  }
  if (response.status === 429 || response.status === 503) {
    throw new ZoteroApiError(
      "Zotero is rate limiting requests. Try again in a moment.",
      response.status
    );
  }
  if (!response.ok) {
    throw new ZoteroApiError(
      describeStatus(response.status, response.statusText),
      response.status
    );
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    throw new ZoteroApiError("Could not read Zotero's response.");
  }

  const created = body?.successful?.["0"];
  if (!created?.key) {
    const failure = body?.failed?.["0"];
    throw new ZoteroApiError(
      failure?.message ? `Zotero rejected the item: ${failure.message}` : "Zotero did not create the item.",
      failure?.code
    );
  }
  return created;
};

export const searchZoteroItems = (
  userId: string,
  apiKey: string,
  query: string,
  options?: FetchAllOptions
) =>
  fetchAllPages<any>(`users/${userId}/items/top`, apiKey, {
    maxPages: 3,
    ...options,
    query: { q: query, qmode: "everything" },
  });

export const getLibraryVersion = async (
  userId: string,
  apiKey: string
): Promise<number> => {
  const response = await fetch(`${ZOTERO_BASE_URI}/users/${userId}/items/top?limit=1&format=keys`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new ZoteroApiError(describeStatus(response.status, response.statusText), response.status);
  }
  const header = response.headers.get("last-modified-version");
  const version = header === null ? NaN : Number(header);
  if (!Number.isFinite(version)) {
    throw new ZoteroApiError("Zotero did not report a library version.");
  }
  return version;
};

export const getItemsSince = (
  userId: string,
  apiKey: string,
  since: number,
  options?: FetchAllOptions
) =>
  fetchAllPages<any>(`users/${userId}/items/top`, apiKey, {
    ...options,
    query: { since: String(since), includeTrashed: "1" },
  });

export const getDeletedSince = async (
  userId: string,
  apiKey: string,
  since: number
): Promise<{ items: string[]; collections: string[] }> => {
  const response = await fetch(`${ZOTERO_BASE_URI}/users/${userId}/deleted?since=${since}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new ZoteroApiError(describeStatus(response.status, response.statusText), response.status);
  }
  const body: any = await response.json();
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return { items: strings(body?.items), collections: strings(body?.collections) };
};
