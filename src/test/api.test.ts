import * as assert from "assert";
import { fetchAllPages, getAllZoteroItems, ZoteroApiError } from "../zotero/api";

type Reply = Response | Error;

const makeItems = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ key: `K${from + i}` }));

function reply(
  body: unknown,
  init: { status?: number; total?: number; version?: string; retryAfter?: string } = {}
): Response {
  const headers: Record<string, string> = {};
  if (init.total !== undefined) {headers["Total-Results"] = String(init.total);}
  if (init.version !== undefined) {headers["Last-Modified-Version"] = init.version;}
  if (init.retryAfter !== undefined) {headers["Retry-After"] = init.retryAfter;}
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

function libraryServer(n: number, opts: { withTotal?: boolean; version?: () => string } = {}) {
  const requests: string[] = [];
  const handler = (url: string): Reply => {
    requests.push(url);
    const q = new URL(url).searchParams;
    const start = Number(q.get("start"));
    const limit = Number(q.get("limit"));
    return reply(makeItems(start, Math.max(0, Math.min(limit, n - start))), {
      total: opts.withTotal === false ? undefined : n,
      version: opts.version?.(),
    });
  };
  return { handler, requests };
}

suite("fetchAllPages", () => {
  const realFetch = globalThis.fetch;
  const noSleep = { sleep: async () => undefined };

  const mockFetch = (handler: (url: string, init?: RequestInit) => Reply) => {
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const r = handler(String(input), init);
      if (r instanceof Error) {throw r;}
      return r;
    }) as typeof fetch;
  };

  teardown(() => {
    globalThis.fetch = realFetch;
  });

  test("loads every page of a multi-page library", async () => {
    const server = libraryServer(250);
    mockFetch(server.handler);
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.strictEqual(result.items.length, 250);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(result.total, 250);
    assert.strictEqual(server.requests.length, 3);
  });

  test("empty library returns no items and is complete", async () => {
    mockFetch(libraryServer(0).handler);
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.deepStrictEqual(result.items, []);
    assert.strictEqual(result.complete, true);
  });

  test("library smaller than one page needs a single request", async () => {
    const server = libraryServer(7);
    mockFetch(server.handler);
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.strictEqual(result.items.length, 7);
    assert.strictEqual(server.requests.length, 1);
  });

  test("exact multiple of the page size makes no extra request", async () => {
    const server = libraryServer(200);
    mockFetch(server.handler);
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.strictEqual(result.items.length, 200);
    assert.strictEqual(server.requests.length, 2);
  });

  test("without Total-Results it stops on the first short page", async () => {
    const server = libraryServer(130, { withTotal: false });
    mockFetch(server.handler);
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.strictEqual(result.items.length, 130);
    assert.strictEqual(result.complete, true);
    assert.strictEqual(server.requests.length, 2);
  });

  test("without Total-Results an exact multiple ends on an empty page", async () => {
    const server = libraryServer(100, { withTotal: false });
    mockFetch(server.handler);
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.strictEqual(result.items.length, 100);
    assert.strictEqual(server.requests.length, 2);
  });

  test("sends the API key, uses the top-level items path and clamps page size", async () => {
    const seen: Array<{ url: string; auth: string | undefined }> = [];
    mockFetch((url, init) => {
      seen.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization });
      return reply([], { total: 0 });
    });
    await fetchAllPages("users/9/items/top", "secret", { pageSize: 5000 });
    assert.strictEqual(seen[0].auth, "Bearer secret");
    assert.ok(seen[0].url.includes("/users/9/items/top?"));
    assert.ok(seen[0].url.includes("limit=100"));
  });

  test("retries after a 429 and honours Retry-After", async () => {
    const waits: number[] = [];
    let calls = 0;
    mockFetch((url) => {
      calls++;
      if (calls === 1) {return reply("", { status: 429, retryAfter: "2" });}
      return libraryServer(3).handler(url);
    });
    const result = await getAllZoteroItems("1", "key", {
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    assert.strictEqual(result.items.length, 3);
    assert.deepStrictEqual(waits, [2000]);
  });

  test("caps an excessive Retry-After", async () => {
    const waits: number[] = [];
    let calls = 0;
    mockFetch((url) => {
      calls++;
      if (calls === 1) {return reply("", { status: 503, retryAfter: "99999" });}
      return libraryServer(1).handler(url);
    });
    await getAllZoteroItems("1", "key", {
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    assert.deepStrictEqual(waits, [30000]);
  });

  test("throws when rate limiting never clears on the first page", async () => {
    mockFetch(() => reply("", { status: 429 }));
    await assert.rejects(getAllZoteroItems("1", "key", noSleep), ZoteroApiError);
  });

  test("a 403 on the first page throws a key-related error without retrying", async () => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      return reply("", { status: 403 });
    });
    await assert.rejects(
      getAllZoteroItems("1", "key", noSleep),
      (e: ZoteroApiError) => e.status === 403 && /API key/.test(e.message)
    );
    assert.strictEqual(calls, 1);
  });

  test("a 404 on the first page reports a missing library", async () => {
    mockFetch(() => reply("", { status: 404 }));
    await assert.rejects(getAllZoteroItems("1", "key", noSleep), /not found/);
  });

  test("a failure on a later page returns the partial result as incomplete", async () => {
    mockFetch((url) =>
      new URL(url).searchParams.get("start") === "0"
        ? reply(makeItems(0, 100), { total: 250 })
        : reply("", { status: 500 })
    );
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.strictEqual(result.items.length, 100);
    assert.strictEqual(result.complete, false);
    assert.ok(result.error);
  });

  test("recovers from a transient network error", async () => {
    let calls = 0;
    mockFetch((url) => {
      calls++;
      if (calls <= 2) {return new TypeError("fetch failed");}
      return libraryServer(5).handler(url);
    });
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.strictEqual(result.items.length, 5);
    assert.strictEqual(result.complete, true);
  });

  test("throws when the network is down on the first page", async () => {
    mockFetch(() => new TypeError("fetch failed"));
    await assert.rejects(getAllZoteroItems("1", "key", noSleep), /Network error/);
  });

  test("rejects a malformed body on the first page", async () => {
    mockFetch(() => reply("<html>oops</html>"));
    await assert.rejects(getAllZoteroItems("1", "key", noSleep), /Could not read/);
  });

  test("rejects a non-array JSON body", async () => {
    mockFetch(() => reply({ message: "nope" }));
    await assert.rejects(getAllZoteroItems("1", "key", noSleep), ZoteroApiError);
  });

  test("removes duplicates and rows without keys", async () => {
    mockFetch(() =>
      reply([{ key: "A" }, { key: "A" }, { nokey: true }, null, { key: "B" }], { total: 2 })
    );
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.deepStrictEqual(result.items.map((i: any) => i.key), ["A", "B"]);
    assert.strictEqual(result.complete, true);
  });

  test("flags a result shorter than Total-Results as incomplete", async () => {
    mockFetch((url) =>
      new URL(url).searchParams.get("start") === "0"
        ? reply(makeItems(0, 100), { total: 300 })
        : reply([], { total: 300 })
    );
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.strictEqual(result.items.length, 100);
    assert.strictEqual(result.complete, false);
    assert.match(result.error ?? "", /100 of 300/);
  });

  test("restarts when the library changes mid-download", async () => {
    let version = 1;
    const server = libraryServer(150, { version: () => String(version) });
    let calls = 0;
    mockFetch((url) => {
      calls++;
      if (calls === 2) {version = 2;}
      return server.handler(url);
    });
    const result = await getAllZoteroItems("1", "key", noSleep);
    assert.strictEqual(result.items.length, 150);
    assert.strictEqual(result.complete, true);
  });

  test("gives up with a partial result if the library never settles", async () => {
    let n = 0;
    const server = libraryServer(300, { version: () => String(n++) });
    mockFetch(server.handler);
    const result = await getAllZoteroItems("1", "key", { ...noSleep, maxRestarts: 1 });
    assert.strictEqual(result.complete, false);
    assert.match(result.error ?? "", /kept changing/);
  });

  test("stops at maxPages instead of looping forever", async () => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      return reply(makeItems(calls * 100, 100));
    });
    const result = await getAllZoteroItems("1", "key", { ...noSleep, maxPages: 3 });
    assert.strictEqual(calls, 3);
    assert.strictEqual(result.complete, false);
    assert.strictEqual(result.items.length, 300);
  });

  test("reports progress after each page", async () => {
    mockFetch(libraryServer(230).handler);
    const progress: Array<[number, number | undefined]> = [];
    await getAllZoteroItems("1", "key", {
      ...noSleep,
      onProgress: (loaded, total) => progress.push([loaded, total]),
    });
    assert.deepStrictEqual(progress, [
      [100, 230],
      [200, 230],
      [230, 230],
    ]);
  });
});
