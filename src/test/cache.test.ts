import * as assert from "assert";
import { CACHE_VERSION, parseSnapshot, serializeSnapshot } from "../services/cacheFormat";
import { DEFAULT_FILTERS, filterItems, searchText, toPanelItems } from "../panel/libraryModel";
import { searchZoteroItems } from "../zotero/api";

const item = (key: string, title: string) => ({
  key,
  data: { itemType: "journalArticle", title, creators: [{ lastName: "Doe" }], date: "2020" },
});

suite("library cache format", () => {
  const snapshot = {
    userId: "42",
    username: "pranesh",
    syncedAt: 1700000000000,
    libraryVersion: 321,
    items: [item("AAAA1111", "One"), item("BBBB2222", "Two")],
    collections: [{ key: "C1", data: { name: "Thesis", parentCollection: false } }],
  };

  test("round-trips a snapshot", () => {
    const parsed = parseSnapshot(serializeSnapshot(snapshot));
    assert.ok(parsed);
    assert.strictEqual(parsed!.version, CACHE_VERSION);
    assert.strictEqual(parsed!.userId, "42");
    assert.strictEqual(parsed!.username, "pranesh");
    assert.strictEqual(parsed!.syncedAt, 1700000000000);
    assert.strictEqual(parsed!.libraryVersion, 321);
    assert.strictEqual(parsed!.items.length, 2);
    assert.strictEqual(parsed!.collections.length, 1);
  });

  test("rejects corrupt, empty, wrong-version and malformed data", () => {
    assert.strictEqual(parseSnapshot(""), null);
    assert.strictEqual(parseSnapshot("{not json"), null);
    assert.strictEqual(parseSnapshot("null"), null);
    assert.strictEqual(parseSnapshot(JSON.stringify({ ...snapshot, version: 999 })), null);
    assert.strictEqual(parseSnapshot(JSON.stringify({ version: CACHE_VERSION, userId: "", items: [], collections: [] })), null);
    assert.strictEqual(parseSnapshot(JSON.stringify({ version: CACHE_VERSION, userId: "1", items: "x", collections: [] })), null);
  });

  test("drops rows without a key or data and tolerates missing optional fields", () => {
    const text = JSON.stringify({
      version: CACHE_VERSION,
      userId: "1",
      items: [item("AAAA1111", "Ok"), { key: "BAD" }, null, { data: {} }],
      collections: [],
    });
    const parsed = parseSnapshot(text)!;
    assert.deepStrictEqual(parsed.items.map((i) => i.key), ["AAAA1111"]);
    assert.strictEqual(parsed.username, "");
    assert.strictEqual(parsed.syncedAt, 0);
    assert.strictEqual(parsed.libraryVersion, 0);
  });
});

suite("search on the Zotero side", () => {
  const rows = [item("AAAA1111", "Alpha Study"), item("BBBB2222", "Beta Study"), item("CCCC3333", "Gamma")];
  const items = toPanelItems(rows);
  const index = new Map(rows.map((r) => [r.key, searchText(r)]));
  const keys = (term: string, external: string[]) =>
    filterItems(items, index, [], { ...DEFAULT_FILTERS, search: term }, new Set(), new Set(external))
      .map((i) => i.key)
      .sort();

  test("items Zotero matched are shown even when local text does not match", () => {
    assert.deepStrictEqual(keys("hidden note text", []), []);
    assert.deepStrictEqual(keys("hidden note text", ["CCCC3333"]), ["CCCC3333"]);
  });

  test("local matches and Zotero matches are combined without duplicates", () => {
    assert.deepStrictEqual(keys("study", ["BBBB2222", "CCCC3333"]), ["AAAA1111", "BBBB2222", "CCCC3333"]);
  });

  test("Zotero matches do not bypass the other filters", () => {
    const result = filterItems(
      items,
      index,
      [],
      { ...DEFAULT_FILTERS, search: "zzz", tab: "cited" },
      new Set(["AAAA1111"]),
      new Set(["BBBB2222"])
    );
    assert.deepStrictEqual(result.map((i) => i.key), []);
  });

  test("empty search ignores external matches", () => {
    assert.strictEqual(keys("", ["CCCC3333"]).length, 3);
  });
});

suite("searchZoteroItems", () => {
  const realFetch = globalThis.fetch;
  teardown(() => {
    globalThis.fetch = realFetch;
  });

  test("queries top-level items with qmode=everything and caps the pages", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: any) => {
      urls.push(String(url));
      const page = urls.length - 1;
      return new Response(
        JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ key: `K${page * 100 + i}` }))),
        { status: 200, headers: { "Total-Results": "1000" } }
      );
    }) as typeof fetch;

    const result = await searchZoteroItems("7", "secret", "deep learning & more");
    const first = new URL(urls[0]);
    assert.strictEqual(first.pathname, "/users/7/items/top");
    assert.strictEqual(first.searchParams.get("q"), "deep learning & more");
    assert.strictEqual(first.searchParams.get("qmode"), "everything");
    assert.strictEqual(first.searchParams.get("limit"), "100");
    assert.strictEqual(urls.length, 3);
    assert.strictEqual(result.items.length, 300);
    assert.strictEqual(result.complete, false);
  });

  test("returns nothing for a query with no matches", async () => {
    globalThis.fetch = (async () =>
      new Response("[]", { status: 200, headers: { "Total-Results": "0" } })) as typeof fetch;
    const result = await searchZoteroItems("7", "secret", "nope");
    assert.deepStrictEqual(result.items, []);
    assert.strictEqual(result.complete, true);
  });
});
