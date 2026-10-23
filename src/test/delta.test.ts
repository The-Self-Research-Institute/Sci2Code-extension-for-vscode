import * as assert from "assert";
import { applyDelta } from "../zotero/delta";
import { getDeletedSince, getItemsSince, getLibraryVersion, ZoteroApiError } from "../zotero/api";

const row = (key: string, title: string, extra: Record<string, unknown> = {}) => ({
  key,
  data: { itemType: "journalArticle", title, ...extra },
});

suite("applyDelta", () => {
  const current = [row("A", "One"), row("B", "Two"), row("C", "Three")];

  test("adds new items and replaces edited ones", () => {
    const result = applyDelta(current, [row("B", "Two (edited)"), row("D", "Four")], []);
    assert.deepStrictEqual(
      result.map((r) => [r.key, r.data.title]).sort(),
      [["A", "One"], ["B", "Two (edited)"], ["C", "Three"], ["D", "Four"]]
    );
  });

  test("removes permanently deleted items", () => {
    assert.deepStrictEqual(applyDelta(current, [], ["A", "C"]).map((r) => r.key), ["B"]);
  });

  test("removes items that were moved to the trash", () => {
    const result = applyDelta(current, [row("A", "One", { deleted: 1 })], []);
    assert.deepStrictEqual(result.map((r) => r.key).sort(), ["B", "C"]);
  });

  test("brings back an item restored from the trash", () => {
    const result = applyDelta([row("A", "One")], [row("B", "Back", { deleted: 0 })], []);
    assert.deepStrictEqual(result.map((r) => r.key).sort(), ["A", "B"]);
  });

  test("ignores malformed rows and unknown deletions, and never mutates its input", () => {
    const snapshot = JSON.stringify(current);
    const result = applyDelta(current, [null, {}, { key: "X" }, { key: 5, data: {} }] as any[], ["NOPE"]);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(JSON.stringify(current), snapshot);
  });

  test("handles an empty library and an empty delta", () => {
    assert.deepStrictEqual(applyDelta([], [], []), []);
    assert.strictEqual(applyDelta([], [row("A", "One")], []).length, 1);
    assert.strictEqual(applyDelta(current, [], []).length, 3);
  });
});

suite("incremental sync requests", () => {
  const realFetch = globalThis.fetch;
  teardown(() => {
    globalThis.fetch = realFetch;
  });

  test("reads the library version from the response header", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 200, headers: { "Last-Modified-Version": "4821" } })) as typeof fetch;
    assert.strictEqual(await getLibraryVersion("7", "k"), 4821);
  });

  test("fails clearly when the version header is missing or the key is rejected", async () => {
    globalThis.fetch = (async () => new Response("", { status: 200 })) as typeof fetch;
    await assert.rejects(getLibraryVersion("7", "k"), /library version/);
    globalThis.fetch = (async () => new Response("", { status: 403 })) as typeof fetch;
    await assert.rejects(getLibraryVersion("7", "k"), (e: ZoteroApiError) => e.status === 403);
  });

  test("asks for changed items since a version, including trashed ones, and reports the new version", async () => {
    let seen = "";
    globalThis.fetch = (async (url: any) => {
      seen = String(url);
      return new Response(JSON.stringify([row("A", "Changed")]), {
        status: 200,
        headers: { "Total-Results": "1", "Last-Modified-Version": "4900" },
      });
    }) as typeof fetch;
    const result = await getItemsSince("7", "k", 4821);
    const params = new URL(seen).searchParams;
    assert.strictEqual(new URL(seen).pathname, "/users/7/items/top");
    assert.strictEqual(params.get("since"), "4821");
    assert.strictEqual(params.get("includeTrashed"), "1");
    assert.strictEqual(result.version, 4900);
    assert.strictEqual(result.items.length, 1);
  });

  test("reads deleted item keys and tolerates odd bodies", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ items: ["A", 5, "B"], collections: ["C1"] }), { status: 200 })) as typeof fetch;
    assert.deepStrictEqual(await getDeletedSince("7", "k", 1), { items: ["A", "B"], collections: ["C1"] });
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    assert.deepStrictEqual(await getDeletedSince("7", "k", 1), { items: [], collections: [] });
    globalThis.fetch = (async () => new Response("", { status: 500 })) as typeof fetch;
    await assert.rejects(getDeletedSince("7", "k", 1), ZoteroApiError);
  });
});
