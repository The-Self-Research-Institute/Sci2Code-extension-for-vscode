import * as assert from "assert";
import { createZoteroItem, ZoteroApiError } from "../zotero/api";
import { buildManualItemData, parseAuthors } from "../zotero/manualItem";

suite("manual items", () => {
  test("parses authors into first and last names", () => {
    assert.deepStrictEqual(parseAuthors("John Doe, Jane Q. Smith, Plato"), [
      { creatorType: "author", firstName: "John", lastName: "Doe" },
      { creatorType: "author", firstName: "Jane Q.", lastName: "Smith" },
      { creatorType: "author", firstName: "", lastName: "Plato" },
    ]);
    assert.deepStrictEqual(parseAuthors(undefined), []);
    assert.deepStrictEqual(parseAuthors(" , ,"), []);
  });

  test("journal articles keep DOI and publication in their own fields", () => {
    const data = buildManualItemData({
      title: " Deep Learning ",
      authors: "Y LeCun",
      year: "2015",
      itemType: "journalArticle",
      doi: "10.1/x",
      url: "https://x.org",
      publicationTitle: "Nature",
    });
    assert.strictEqual(data.title, "Deep Learning");
    assert.strictEqual(data.DOI, "10.1/x");
    assert.strictEqual(data.publicationTitle, "Nature");
    assert.strictEqual(data.date, "2015");
    assert.strictEqual(data.url, "https://x.org");
    assert.strictEqual(data.extra, undefined);
  });

  test("conference papers and webpages use the right publication field", () => {
    assert.strictEqual(
      buildManualItemData({ title: "T", itemType: "conferencePaper", publicationTitle: "NeurIPS" }).proceedingsTitle,
      "NeurIPS"
    );
    assert.strictEqual(
      buildManualItemData({ title: "T", itemType: "webpage", publicationTitle: "Blog" }).websiteTitle,
      "Blog"
    );
  });

  test("fields a type does not support go to extra instead of being rejected", () => {
    const data = buildManualItemData({
      title: "T",
      itemType: "book",
      doi: "10.1/b",
      publicationTitle: "Press",
    });
    assert.strictEqual(data.DOI, undefined);
    assert.strictEqual(data.publicationTitle, undefined);
    assert.strictEqual(data.extra, "DOI: 10.1/b\nPublication: Press");
  });

  test("unknown types become a document and empty titles become Untitled", () => {
    const data = buildManualItemData({ title: "  ", itemType: "other" });
    assert.strictEqual(data.itemType, "document");
    assert.strictEqual(data.title, "Untitled");
    assert.deepStrictEqual(data.creators, []);
    assert.strictEqual(data.date, undefined);
  });
});

suite("createZoteroItem", () => {
  const realFetch = globalThis.fetch;
  teardown(() => {
    globalThis.fetch = realFetch;
  });

  const respond = (body: unknown, status = 200) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

  test("posts the item with a write token and returns the created item", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = (async (url: any, init?: RequestInit) => {
      seen = { url: String(url), init };
      return respond({ successful: { "0": { key: "ABCD1234", data: { title: "T" } } }, failed: {} });
    }) as typeof fetch;

    const created = await createZoteroItem("42", "secret", { itemType: "book", title: "T" });
    assert.strictEqual(created.key, "ABCD1234");
    assert.strictEqual(seen!.url, "https://api.zotero.org/users/42/items");
    assert.strictEqual(seen!.init!.method, "POST");
    const headers = seen!.init!.headers as Record<string, string>;
    assert.strictEqual(headers.Authorization, "Bearer secret");
    assert.match(headers["Zotero-Write-Token"], /^[0-9a-f]{32}$/);
    assert.deepStrictEqual(JSON.parse(seen!.init!.body as string), [{ itemType: "book", title: "T" }]);
  });

  test("reports a read-only key clearly", async () => {
    globalThis.fetch = (async () => respond("", 403)) as typeof fetch;
    await assert.rejects(
      createZoteroItem("42", "k", {}),
      (e: ZoteroApiError) => e.status === 403 && /write access/.test(e.message)
    );
  });

  test("surfaces a per-item rejection message", async () => {
    globalThis.fetch = (async () =>
      respond({ successful: {}, failed: { "0": { code: 400, message: "'foo' is not a valid field" } } })) as typeof fetch;
    await assert.rejects(createZoteroItem("42", "k", {}), /not a valid field/);
  });

  test("fails when Zotero returns neither success nor failure", async () => {
    globalThis.fetch = (async () => respond({})) as typeof fetch;
    await assert.rejects(createZoteroItem("42", "k", {}), /did not create/);
  });

  test("reports rate limiting, server errors, bad bodies and network errors", async () => {
    globalThis.fetch = (async () => respond("", 429)) as typeof fetch;
    await assert.rejects(createZoteroItem("42", "k", {}), /rate limiting/);

    globalThis.fetch = (async () => respond("", 500)) as typeof fetch;
    await assert.rejects(createZoteroItem("42", "k", {}), ZoteroApiError);

    globalThis.fetch = (async () => respond("<html>")) as typeof fetch;
    await assert.rejects(createZoteroItem("42", "k", {}), /Could not read/);

    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(createZoteroItem("42", "k", {}), /Network error/);
  });
});
