import * as assert from "assert";
import {
  DEFAULT_FILTERS,
  allTags,
  collectionOptions,
  extractCitedKeys,
  filterItems,
  findUnresolvedCitations,
  formatAuthors,
  searchText,
  toPanelItems,
  PAGE_SIZE,
  paginate,
  unresolvedAsItems,
} from "../panel/libraryModel";

const raw = (
  key: string,
  data: Record<string, unknown>
): any => ({ key, data: { itemType: "journalArticle", ...data } });

const articles = [
  raw("AAAA1111", {
    title: "Attention Is All You Need",
    creators: [{ lastName: "Vaswani" }, { lastName: "Shazeer" }, { lastName: "Parmar" }, { lastName: "Uszkoreit" }],
    date: "2017-06-12",
    DOI: "10.1/attn",
    collections: ["C2"],
    tags: [{ tag: "transformers" }, { tag: '{"codeId":"x"}' }],
  }),
  raw("BBBB2222", {
    title: "Adam: A Method for Stochastic Optimization",
    creators: [{ lastName: "Kingma" }, { lastName: "Ba" }],
    date: "2015",
    archiveID: "arXiv:1412.6980",
    collections: ["C1"],
  }),
  raw("CCCC3333", { title: "The Elements of Statistical Learning", creators: [], date: "2009" }),
  raw("DDDD4444", { itemType: "note", note: "<p>hi</p>" }),
];

const collections = [
  { key: "C1", data: { name: "Thesis", parentCollection: false as const } },
  { key: "C2", data: { name: "Chapter 2", parentCollection: "C1" } },
];

suite("libraryModel", () => {
  const items = toPanelItems(articles);
  const index = new Map(articles.filter((r) => r.data).map((r) => [r.key, searchText(r)]));
  const run = (filters: Partial<typeof DEFAULT_FILTERS>, cited: string[] = []) =>
    filterItems(items, index, collections, { ...DEFAULT_FILTERS, ...filters }, new Set(cited)).map((i) => i.key);

  test("flags items without a title for review and shows the filename", () => {
    const [item] = toPanelItems([raw("FFFF6666", { itemType: "attachment", filename: "research-notes.pdf" })]);
    assert.strictEqual(item.title, "research-notes.pdf");
    assert.strictEqual(item.needsReview, true);
    assert.strictEqual(items.find((i) => i.key === "AAAA1111")!.needsReview, false);
  });

  test("excludes notes", () => {
    assert.deepStrictEqual(items.map((i) => i.key).sort(), ["AAAA1111", "BBBB2222", "CCCC3333"]);
  });

  test("formats authors", () => {
    assert.strictEqual(formatAuthors(undefined), "");
    assert.strictEqual(formatAuthors([{ lastName: "Ba" }]), "Ba");
    assert.strictEqual(formatAuthors([{ lastName: "A" }, { lastName: "B" }]), "A & B");
    assert.strictEqual(formatAuthors([{ lastName: "A" }, { lastName: "B" }, { lastName: "C" }]), "A, B & C");
    assert.strictEqual(formatAuthors([{ lastName: "A" }, { lastName: "B" }, { lastName: "C" }, { lastName: "D" }]), "A et al.");
    assert.strictEqual(formatAuthors([{ name: "WHO" }]), "WHO");
  });

  test("maps identifiers, year and tags", () => {
    const attn = items.find((i) => i.key === "AAAA1111")!;
    assert.strictEqual(attn.identifier, "DOI: 10.1/attn");
    assert.strictEqual(attn.year, "2017");
    assert.deepStrictEqual(attn.tags, ["transformers"]);
    assert.strictEqual(items.find((i) => i.key === "BBBB2222")!.identifier, "arXiv:1412.6980");
    assert.strictEqual(items.find((i) => i.key === "CCCC3333")!.authors, "");
  });

  test("defaults to newest first", () => {
    assert.strictEqual(DEFAULT_FILTERS.sort, "year");
    assert.deepStrictEqual(run({}), ["AAAA1111", "BBBB2222", "CCCC3333"]);
  });

  test("sorts by title, author, year and type", () => {
    assert.deepStrictEqual(run({ sort: "title" }), ["BBBB2222", "AAAA1111", "CCCC3333"]);
    assert.deepStrictEqual(run({ sort: "author" }), ["BBBB2222", "AAAA1111", "CCCC3333"]);
    assert.deepStrictEqual(run({ sort: "year" }), ["AAAA1111", "BBBB2222", "CCCC3333"]);
    assert.strictEqual(run({ sort: "type" }).length, 3);
  });

  test("searches title, author, doi, tags and is case-insensitive", () => {
    assert.deepStrictEqual(run({ search: "attention" }), ["AAAA1111"]);
    assert.deepStrictEqual(run({ search: "KINGMA" }), ["BBBB2222"]);
    assert.deepStrictEqual(run({ search: "10.1/attn" }), ["AAAA1111"]);
    assert.deepStrictEqual(run({ search: "transformers" }), ["AAAA1111"]);
    assert.deepStrictEqual(run({ search: "  " }).length, 3);
    assert.deepStrictEqual(run({ search: "nothing-matches" }), []);
  });

  test("collection filter includes subcollections", () => {
    assert.deepStrictEqual(run({ collection: "C1" }).sort(), ["AAAA1111", "BBBB2222"]);
    assert.deepStrictEqual(run({ collection: "C2" }), ["AAAA1111"]);
    assert.deepStrictEqual(run({ collection: "MISSING" }), []);
  });

  test("tag filter and combined filters", () => {
    assert.deepStrictEqual(run({ tag: "transformers" }), ["AAAA1111"]);
    assert.deepStrictEqual(run({ tag: "transformers", collection: "C1", search: "adam" }), []);
  });

  test("cited tab only shows cited keys", () => {
    assert.deepStrictEqual(run({ tab: "cited" }, ["CCCC3333"]), ["CCCC3333"]);
    assert.deepStrictEqual(run({ tab: "cited" }, []), []);
  });

  test("collection options are labelled by path", () => {
    assert.deepStrictEqual(collectionOptions(collections).map((o) => o.label), ["Thesis", "Thesis / Chapter 2"]);
  });

  test("collection paths survive a parent cycle", () => {
    const cyclic = [
      { key: "X", data: { name: "X", parentCollection: "Y" } },
      { key: "Y", data: { name: "Y", parentCollection: "X" } },
    ];
    assert.strictEqual(collectionOptions(cyclic).length, 2);
  });

  test("lists user tags only", () => {
    assert.deepStrictEqual(allTags(items), ["transformers"]);
  });

  test("extracts cited keys that exist in the library", () => {
    const known = new Set(["AAAA1111", "BBBB2222"]);
    const text = "# AAAA1111 and AAAA1111 again, ZZZZ9999 unknown, BBBB2222";
    assert.deepStrictEqual(extractCitedKeys(text, known), ["AAAA1111", "BBBB2222"]);
    assert.deepStrictEqual(extractCitedKeys("", known), []);
  });

  test("tolerates items with missing data", () => {
    assert.deepStrictEqual(toPanelItems([null, {}, { key: "K" }] as any[]), []);
  });

  test("finds citations that are not in the library", () => {
    const text = [
      "/**",
      " * @ZoteroArticleNames Attention Is All You Need",
      " * @ZoteroArticleIDs AAAA1111",
      " * @ZoteroDOI 10.1/attn",
      " */",
      "function a() {}",
      "/**",
      " * @ZoteroArticleNames test",
      " * @ZoteroArticleIDs MANUAL_1792747842054",
      " * @ZoteroArticleURLs https://example.org/t",
      " * @ZoteroDOI N/A",
      " * @CodeID e46d7cbd",
      " */",
      "function b() {}",
      "/**",
      " * @ZoteroArticleNames Gone",
      " * @ZoteroArticleIDs ZZZZ9999",
      " */",
    ].join("\n");
    const found = findUnresolvedCitations(text, new Set(["AAAA1111"]));
    assert.deepStrictEqual(found, [
      { key: "MANUAL_1792747842054", title: "test", doi: "", url: "https://example.org/t" },
      { key: "ZZZZ9999", title: "Gone", doi: "", url: "" },
    ]);
  });

  test("falls back to the key when the title is missing or N/A", () => {
    const found = findUnresolvedCitations(
      "/**\n * @ZoteroArticleNames N/A\n * @ZoteroArticleIDs MANUAL_1\n */\nlet x = MANUAL_2;",
      new Set()
    );
    assert.deepStrictEqual(found.map((f) => [f.key, f.title]), [["MANUAL_1", "MANUAL_1"], ["MANUAL_2", "MANUAL_2"]]);
  });

  test("ignores N/A ids and resolved keys, and reports each key once", () => {
    const text = "// @ZoteroArticleIDs N/A\n// @ZoteroArticleIDs MANUAL_5\n// MANUAL_5 again\n// @ZoteroArticleIDs AAAA1111";
    assert.deepStrictEqual(
      findUnresolvedCitations(text, new Set(["AAAA1111"])).map((f) => f.key),
      ["MANUAL_5"]
    );
    assert.deepStrictEqual(findUnresolvedCitations("", new Set()), []);
  });

  test("unresolved citations respect search and hide under collection or tag filters", () => {
    const unresolved = [{ key: "MANUAL_1", title: "My Thesis", doi: "", url: "" }];
    assert.strictEqual(unresolvedAsItems(unresolved, { ...DEFAULT_FILTERS }).length, 1);
    assert.strictEqual(unresolvedAsItems(unresolved, { ...DEFAULT_FILTERS, search: "thesis" }).length, 1);
    assert.strictEqual(unresolvedAsItems(unresolved, { ...DEFAULT_FILTERS, search: "zzz" }).length, 0);
    assert.strictEqual(unresolvedAsItems(unresolved, { ...DEFAULT_FILTERS, tag: "ml" }).length, 0);
    assert.strictEqual(unresolvedAsItems(unresolved, { ...DEFAULT_FILTERS })[0].unresolved, true);
  });

  test("marks attachments as files with an extension badge", () => {
    const [owl, plain, article] = toPanelItems([
      raw("OWL00001", { itemType: "attachment", title: "SDA-Medica_Cardio-updated-1.owl" }),
      raw("PDF00001", { itemType: "attachment", title: "Notes", filename: "notes.final.pdf" }),
      raw("ART00001", { title: "Paper.pdf" }),
    ]);
    assert.strictEqual(owl.isFile, true);
    assert.strictEqual(owl.fileExt, "OWL");
    assert.strictEqual(plain.fileExt, "PDF");
    assert.strictEqual(article.isFile, false);
    assert.strictEqual(article.fileExt, "");
  });

  test("defaults to a compact page that fits a sidebar", () => {
    assert.strictEqual(PAGE_SIZE, 5);
    assert.strictEqual(paginate(Array.from({ length: 35 }, (_, i) => i), 0).items.length, 5);
    assert.strictEqual(paginate(Array.from({ length: 35 }, (_, i) => i), 0).pageCount, 7);
  });

  test("paginates in pages of 25 and clamps out-of-range pages", () => {
    const rows = Array.from({ length: 60 }, (_, i) => i);
    const first = paginate(rows, 0, 25);
    assert.deepStrictEqual([first.items.length, first.page, first.pageCount, first.from, first.to], [25, 0, 3, 1, 25]);
    const last = paginate(rows, 2, 25);
    assert.deepStrictEqual([last.items.length, last.from, last.to], [10, 51, 60]);
    assert.strictEqual(paginate(rows, 99, 25).page, 2);
    assert.strictEqual(paginate(rows, -4, 25).page, 0);
    assert.strictEqual(paginate(rows, NaN, 25).page, 0);
  });

  test("pagination handles empty and exact-multiple lists", () => {
    const empty = paginate([], 0, 25);
    assert.deepStrictEqual([empty.items.length, empty.pageCount, empty.from, empty.to, empty.total], [0, 1, 0, 0, 0]);
    const exact = paginate(Array.from({ length: 50 }, (_, i) => i), 1, 25);
    assert.deepStrictEqual([exact.pageCount, exact.items.length, exact.from, exact.to], [2, 25, 26, 50]);
    assert.strictEqual(paginate([1, 2, 3], 0, 2).pageCount, 2);
  });

  test("pages beyond what has loaded so far report pending rows", () => {
    const loaded = Array.from({ length: 30 }, (_, i) => i);
    const first = paginate(loaded, 0, 25, 100);
    assert.deepStrictEqual([first.pageCount, first.items.length, first.pending, first.total], [4, 25, 0, 100]);
    const second = paginate(loaded, 1, 25, 100);
    assert.deepStrictEqual([second.items.length, second.pending, second.from, second.to], [5, 20, 26, 30]);
    const tenth = paginate(loaded, 9, 25, 260);
    assert.deepStrictEqual([tenth.page, tenth.items.length, tenth.pending, tenth.pageCount], [9, 0, 25, 11]);
    const lastPartial = paginate(loaded, 3, 25, 80);
    assert.deepStrictEqual([lastPartial.items.length, lastPartial.pending], [0, 5]);
  });

  test("a fully loaded list never reports pending rows and ignores a smaller expected total", () => {
    const rows = Array.from({ length: 40 }, (_, i) => i);
    assert.strictEqual(paginate(rows, 1, 25, 0).pending, 0);
    assert.strictEqual(paginate(rows, 1, 25, 10).pending, 0);
    assert.strictEqual(paginate(rows, 1, 25, 10).total, 40);
  });
});
