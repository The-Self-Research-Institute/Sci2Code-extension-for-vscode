import * as assert from "assert";
import {
  betterBibTeXKey,
  bibtexForItems,
  describeCiteKey,
  escapeBraces,
  extractBibliographyDeclaration,
  extractBibliographyPaths,
  projectBibliographyApplies,
  formatEntryBibTeX,
  isValidBibKey,
  isWellFormedEntry,
  normalizeDoi,
  parseBibEntries,
  planBibSync,
  stripTypstNonCode,
} from "../features/bibtex";
import { quartoChunkLanguage } from "../utils/quartoChunk";
import { findUnresolvedCitations } from "../panel/libraryModel";

function item(key: string, data: any): any {
  return { key, data: { itemType: "journalArticle", ...data } };
}

const smith = item("AAAAAAAA", {
  title: "Adaptive Solvers for Stiff Systems",
  creators: [{ creatorType: "author", firstName: "Jane", lastName: "Smith" }],
  date: "2024-03-01",
  publicationTitle: "Journal of Numerics",
  DOI: "10.1000/smith.2024",
});
const lee = item("BBBBBBBB", {
  title: "A Study Without a DOI",
  creators: [{ creatorType: "author", firstName: "Min", lastName: "Lee" }],
  date: "2022",
});

suite("bibtex: key generation", () => {
  test("uses authorYear and suffixes collisions", () => {
    const used = new Set<string>();
    assert.ok(formatEntryBibTeX(smith, used).startsWith("@article{smith2024,"));
    assert.ok(formatEntryBibTeX(smith, used).startsWith("@article{smith2024a,"));
    assert.ok(formatEntryBibTeX(smith, used).startsWith("@article{smith2024b,"));
  });

  test("prefers the Better BibTeX key from extra", () => {
    const bbt = item("CCCCCCCC", { ...smith.data, extra: "tex.ids: x\nCitation Key: smithAdaptive2024" });
    assert.strictEqual(betterBibTeXKey(bbt), "smithAdaptive2024");
    assert.ok(formatEntryBibTeX(bbt, new Set()).startsWith("@article{smithAdaptive2024,"));
  });

  test("keeps each field on one line", () => {
    const messy = item("DDDDDDDD", { title: "Two\nline   title", date: "2020" });
    assert.ok(formatEntryBibTeX(messy, new Set()).includes("title = {Two line   title}"));
  });
});

suite("bibtex: unmatched braces", () => {
  test("balanced braces are left alone", () => {
    assert.strictEqual(escapeBraces("The {DNA} model"), "The {DNA} model");
  });

  test("unmatched braces are replaced so the entry stays balanced", () => {
    assert.strictEqual(escapeBraces("A literal } in a title"), "A literal \\textbraceright{} in a title");
    assert.strictEqual(escapeBraces("Set {x | x > 0"), "Set \\textbraceleft{}x | x > 0");
    assert.strictEqual(escapeBraces("}{"), "\\textbraceright{}\\textbraceleft{}");
  });

  test("a title with a stray brace produces an entry that parses back, and does not swallow the next one", () => {
    const evil = item("EEEEEEEE", { title: "A literal } in a title", creators: [{ lastName: "Evil" }], date: "2023", DOI: "10.1/evil" });
    const used = new Set<string>();
    const block = formatEntryBibTeX(evil, used);
    assert.ok(isWellFormedEntry(block, "evil2023"));
    const plan = planBibSync([""], [evil, smith]);
    assert.deepStrictEqual(plan.added.map((a) => a.bibKey), ["evil2023", "smith2024"]);
    assert.deepStrictEqual(parseBibEntries(plan.append).map((e) => e.key), ["evil2023", "smith2024"]);
  });

  test("isWellFormedEntry rejects broken or multiple entries", () => {
    assert.strictEqual(isWellFormedEntry("@article{k,\n  title = {a } b}\n}", "k"), false);
    assert.strictEqual(isWellFormedEntry("@misc{a, title={x}}\n@misc{b, title={y}}", "a"), false);
    assert.strictEqual(isWellFormedEntry("@misc{a, title={x}}", "other"), false);
  });
});

suite("bibtex: reading an existing file", () => {
  const bib = [
    "% my notes",
    "@comment{ignore me}",
    "@string{jn = \"Journal of Numerics\"}",
    "@article{hand_edited_key,",
    "  author = {Smith, Jane},",
    "  title = {{Adaptive Solvers for Stiff Systems}},",
    "  doi = {https://doi.org/10.1000/SMITH.2024},",
    "  year = 2024",
    "}",
    "",
    "@book{lee22, title = \"A Study Without a DOI\", year = \"2022\" }",
  ].join("\n");

  test("finds keys, normalised DOIs and title+year, skipping @comment/@string", () => {
    const entries = parseBibEntries(bib);
    assert.deepStrictEqual(entries.map((e) => e.key), ["hand_edited_key", "lee22"]);
    assert.strictEqual(entries[0].doi, "10.1000/smith.2024");
    assert.ok(entries[0].titleYear?.startsWith("adaptivesolversforstiffsystems|2024"));
  });

  test("normalizeDoi strips prefixes and case", () => {
    assert.strictEqual(normalizeDoi("doi:10.1/ABC"), "10.1/abc");
    assert.strictEqual(normalizeDoi(" http://dx.doi.org/10.1/ABC "), "10.1/abc");
  });
});

suite("bibtex: finding the declared .bib", () => {
  test("quarto front matter: single, inline list and block list", () => {
    const doc = (fm: string) => extractBibliographyPaths(`---\n${fm}\n---\nBody`, "quarto-document");
    assert.deepStrictEqual(doc("title: x\nbibliography: refs/main.bib"), ["refs/main.bib"]);
    assert.deepStrictEqual(doc('bibliography: [a.bib, "b.bib"]'), ["a.bib", "b.bib"]);
    assert.deepStrictEqual(doc("bibliography:\n  - one.bib\n  - 'two.bib'  # note\ncsl: x.csl"), ["one.bib", "two.bib"]);
  });

  test("a quarto document without front matter declares nothing, even with a fenced YAML example", () => {
    const text = "# Title\n\nExample config:\n\n```yaml\nbibliography: example.bib\n```\n";
    assert.deepStrictEqual(extractBibliographyPaths(text, "quarto-document"), []);
  });

  test("a bibliography line in the body or indented under another key is ignored", () => {
    assert.deepStrictEqual(extractBibliographyPaths("---\ntitle: x\n---\n\nbibliography: nope.bib\n", "quarto-document"), []);
    assert.deepStrictEqual(extractBibliographyPaths("---\nformat:\n  html:\n    bibliography: nested.bib\n---\n", "quarto-document"), []);
  });

  test("_quarto.yml is read as a whole", () => {
    assert.deepStrictEqual(
      extractBibliographyPaths("project:\n  type: book\nbibliography: shared/lib.bib\n", "quarto-project"),
      ["shared/lib.bib"]
    );
  });

  test("typst single, array and non-.bib files", () => {
    assert.deepStrictEqual(extractBibliographyPaths('#bibliography("library.bib", style: "ieee")', "typst"), ["library.bib"]);
    assert.deepStrictEqual(extractBibliographyPaths('#bibliography(("a.bib", "b.bib"))', "typst"), ["a.bib", "b.bib"]);
    assert.deepStrictEqual(extractBibliographyPaths('#bibliography("works.yml")', "typst"), []);
  });

  test("typst: line comments, nested block comments and raw blocks are not declarations", () => {
    const text = [
      '// #bibliography("old.bib")',
      '/* notes /* nested */ #bibliography("block.bib") still a comment */',
      "```typ",
      '#bibliography("sample.bib")',
      "```",
      '#bibliography("real.bib")',
    ].join("\n");
    assert.deepStrictEqual(extractBibliographyPaths(text, "typst"), ["real.bib"]);
  });

  test("typst: only a real #bibliography call counts, not the word in prose", () => {
    const text = 'The function bibliography("decoy.bib") is documented elsewhere.\n#bibliography("real.bib")\n';
    assert.deepStrictEqual(extractBibliographyPaths(text, "typst"), ["real.bib"]);
  });

  test("typst: a URL in prose is not a comment start", () => {
    assert.strictEqual(stripTypstNonCode("see https://x.org/a #bibliography(\"r.bib\")").includes("bibliography"), true);
    const unclosed = ["/**", "//", "#let f(x) = x", '#bibliography("refs.bib")', ""].join("\n");
    assert.deepStrictEqual(extractBibliographyDeclaration(unclosed, "typst").paths, ["refs.bib"]);
  });
});

suite("quarto: document and project bibliographies", () => {
  const doc = (fm: string) => extractBibliographyDeclaration("---\n" + fm + "\n---\n", "quarto-document");

  test("remembers whether the value was a single path or a list", () => {
    assert.deepStrictEqual(doc("bibliography: paper.bib"), { paths: ["paper.bib"], isList: false });
    assert.deepStrictEqual(doc("bibliography: [paper.bib]"), { paths: ["paper.bib"], isList: true });
    assert.deepStrictEqual(doc("bibliography:\n  - paper.bib"), { paths: ["paper.bib"], isList: true });
    assert.deepStrictEqual(doc("title: x"), { paths: [], isList: false });
  });

  test("a single document path replaces the project bibliography", () => {
    assert.strictEqual(projectBibliographyApplies(doc("bibliography: paper.bib")), false);
  });

  test("a document list is combined with the project bibliography", () => {
    assert.strictEqual(projectBibliographyApplies(doc("bibliography: [paper.bib]")), true);
    assert.strictEqual(projectBibliographyApplies(doc("bibliography:\n  - paper.bib")), true);
  });

  test("a document with no bibliography uses the project's", () => {
    assert.strictEqual(projectBibliographyApplies(doc("title: x")), true);
  });

  test("merge rule: a single path replaces another single path, any list is combined", () => {
    const single = { paths: ["a.bib"], isList: false };
    const list = { paths: ["a.bib", "b.bib"], isList: true };
    const none = { paths: [], isList: false };
    assert.strictEqual(projectBibliographyApplies(single, single), false);
    assert.strictEqual(projectBibliographyApplies(single, list), true);
    assert.strictEqual(projectBibliographyApplies(list, single), true);
    assert.strictEqual(projectBibliographyApplies(list, list), true);
    assert.strictEqual(projectBibliographyApplies(none, single), true);
    assert.strictEqual(projectBibliographyApplies(single, undefined), false);
  });

  test("only the first bibliography key is read", () => {
    assert.deepStrictEqual(doc("bibliography: a.bib\nbibliography: b.bib").paths, ["a.bib"]);
  });
});

suite("bibtex: key shown for a paper in the sidebar", () => {
  const entries = parseBibEntries(
    "@article{kept_by_hand, title = {Adaptive Solvers for Stiff Systems}, doi = {10.1000/SMITH.2024}}\n" +
      "@misc{lee22, title = {A Study Without a DOI}, year = {2022}}\n" +
      "@article{okafor2025, title = {Other}, doi = {10.2/other}}"
  );

  test("a paper already in the file shows the key the author already uses", () => {
    assert.deepStrictEqual(describeCiteKey(smith, entries), { key: "kept_by_hand", inFile: true });
    assert.deepStrictEqual(describeCiteKey(lee, entries), { key: "lee22", inFile: true });
  });

  test("a new paper shows the key sync would write", () => {
    const fresh = item("IIIIIIII", { title: "Brand New", creators: [{ lastName: "Okafor" }], date: "2025", DOI: "10.3/new" });
    assert.deepStrictEqual(describeCiteKey(fresh, entries), { key: "okafor2025a", inFile: false });
    assert.deepStrictEqual(describeCiteKey(smith, []), { key: "smith2024", inFile: false });
  });

  test("a Better BibTeX key is used as the predicted key", () => {
    const bbt = item("JJJJJJJJ", { ...smith.data, DOI: "10.9/x", extra: "Citation Key: smithAdaptive2024" });
    assert.deepStrictEqual(describeCiteKey(bbt, []), { key: "smithAdaptive2024", inFile: false });
  });

  test("agrees with what sync actually adds", () => {
    const fresh = item("KKKKKKKK", { title: "Another New One", creators: [{ lastName: "Diaz" }], date: "2021", DOI: "10.4/diaz" });
    const predicted = describeCiteKey(fresh, entries).key;
    assert.deepStrictEqual(planBibSync(["@misc{x, title={x}}"].concat(), [fresh]).added.map((a) => a.bibKey), [predicted]);
  });
});

suite("bibtex: output for clipboard and cursor", () => {
  const badKey = item("HHHHHHHH", { ...smith.data, extra: "Citation Key: bad,key" });

  test("a malformed custom key is left out and reported, never written", () => {
    const out = bibtexForItems([badKey, lee]);
    assert.deepStrictEqual(out.invalid, ["HHHHHHHH"]);
    assert.ok(!out.text.includes("bad,key"));
    assert.deepStrictEqual(parseBibEntries(out.text).map((e) => e.key), ["lee2022"]);
  });

  test("valid items produce parseable BibTeX with no trailing blank line", () => {
    const out = bibtexForItems([smith, lee]);
    assert.deepStrictEqual(out.invalid, []);
    assert.deepStrictEqual(parseBibEntries(out.text).map((e) => e.key), ["smith2024", "lee2022"]);
    assert.ok(out.text.endsWith("}"));
  });

  test("nothing valid gives empty text", () => {
    assert.deepStrictEqual(bibtexForItems([badKey]), { text: "", invalid: ["HHHHHHHH"] });
  });
});

suite("bibtex: custom citation keys", () => {
  const withKey = (key: string) => item("HHHHHHHH", { ...smith.data, extra: "Citation Key: " + key });

  test("isValidBibKey accepts normal keys and rejects ones that break BibTeX", () => {
    for (const ok of ["smith2024", "smithAdaptive2024", "smith_2024:a", "doe.2020-b", "müller2021"]) {
      assert.strictEqual(isValidBibKey(ok), true, ok);
    }
    for (const bad of ["bad,key", "a b", "k{x", "k}x", 'q"x', "k=v", "#k", "", "a%b", "a\\b"]) {
      assert.strictEqual(isValidBibKey(bad), false, bad);
    }
  });

  test("a malformed Better BibTeX key is reported, never written", () => {
    const plan = planBibSync(["@misc{keep, title = {Keep}}\n"], [withKey("bad,key"), lee]);
    assert.deepStrictEqual(plan.invalid, ["HHHHHHHH"]);
    assert.deepStrictEqual(plan.added.map((a) => a.bibKey), ["lee2022"]);
    assert.ok(!plan.append.includes("bad,key"));
    assert.deepStrictEqual(parseBibEntries(plan.append).map((e) => e.key), ["lee2022"]);
  });

  test("a valid custom key is used as is", () => {
    const plan = planBibSync([""], [withKey("smithAdaptive2024")]);
    assert.deepStrictEqual(plan.added.map((a) => a.bibKey), ["smithAdaptive2024"]);
  });
});

suite("bibtex: append-only sync", () => {
  test("creates a full file when none exists", () => {
    const plan = planBibSync([""], [smith, lee]);
    assert.deepStrictEqual(plan.added.map((a) => a.bibKey), ["smith2024", "lee2022"]);
    assert.ok(plan.append.startsWith("@article{smith2024,"));
    assert.ok(plan.append.endsWith("}\n"));
  });

  test("never rewrites existing content, and reports the key the author already uses", () => {
    const existing =
      "@article{kept_by_hand,\n  title = {Adaptive Solvers for Stiff Systems},\n  doi = {10.1000/SMITH.2024}\n}\n\n" +
      "@misc{lee22, title = {A Study Without a DOI}, year = {2022}}";
    const fresh = item("FFFFFFFF", {
      title: "Brand New Paper",
      creators: [{ creatorType: "author", lastName: "Okafor" }],
      date: "2025",
    });
    const plan = planBibSync([existing], [smith, lee, fresh]);
    assert.deepStrictEqual(
      plan.existing.map((e) => [e.zoteroKey, e.bibKey, e.reason]),
      [["AAAAAAAA", "kept_by_hand", "doi"], ["BBBBBBBB", "lee22", "title"]]
    );
    assert.deepStrictEqual(plan.added.map((a) => a.bibKey), ["okafor2025"]);
    assert.ok(plan.append.startsWith("\n\n@"), "separates from a file with no trailing newline");
    assert.ok(!plan.append.includes("kept_by_hand"));
  });

  test("two Zotero items with the same DOI resolve to one entry", () => {
    const twin = item("GGGGGGGG", { ...smith.data });
    const plan = planBibSync([""], [smith, twin]);
    assert.deepStrictEqual(plan.added.map((a) => a.bibKey), ["smith2024"]);
    assert.deepStrictEqual(plan.existing.map((e) => [e.zoteroKey, e.bibKey]), [["GGGGGGGG", "smith2024"]]);
  });

  test("is idempotent: applying the plan then re-running adds nothing but still reports keys", () => {
    const first = planBibSync([""], [smith, lee]);
    const second = planBibSync([first.append], [smith, lee]);
    assert.strictEqual(second.append, "");
    assert.strictEqual(second.added.length, 0);
    assert.deepStrictEqual(second.existing.map((e) => e.bibKey), ["smith2024", "lee2022"]);
  });

  test("never reuses a key that already exists for a different paper", () => {
    const existing = "@article{smith2024,\n  title = {Some Other Paper},\n  doi = {10.9/other}\n}\n";
    const plan = planBibSync([existing], [smith]);
    assert.deepStrictEqual(plan.added.map((a) => a.bibKey), ["smith2024a"]);
  });

  test("checks other declared .bib files for duplicates and reports their key", () => {
    const plan = planBibSync(["", "@article{x, doi = {10.1000/smith.2024}}"], [smith]);
    assert.strictEqual(plan.added.length, 0);
    assert.deepStrictEqual(plan.existing.map((e) => e.bibKey), ["x"]);
  });

  test("keeps the file's CRLF line endings", () => {
    const plan = planBibSync(["@misc{a, title = {A}}\r\n"], [lee]);
    assert.ok(plan.append.includes("\r\n"));
    assert.ok(!/[^\r]\n/.test(plan.append));
  });
});

suite("quarto code chunks", () => {
  const doc = [
    "# Title",                 // 0
    "",                        // 1
    "```{python}",             // 2
    "#| echo: false",          // 3
    "def run(): pass",         // 4
    "```",                     // 5
    "Some prose.",             // 6
    "````{r}",                 // 7
    "```",                     // 8  (shorter fence inside a longer one: not a close)
    "f <- function() 1",       // 9
    "````",                    // 10
    "```{=html}",              // 11
    "<b>raw</b>",              // 12
    "```",                     // 13
    "~~~julia",                // 14
    "function g() end",        // 15
    "~~~",                     // 16
    "```bash",                 // 17
    "ls",                      // 18
    "```",                     // 19
  ];
  const at = (i: number) => doc[i];

  test("returns the chunk language for executable chunks", () => {
    assert.strictEqual(quartoChunkLanguage(at, 4), "python");
    assert.strictEqual(quartoChunkLanguage(at, 9), "r");
    assert.strictEqual(quartoChunkLanguage(at, 15), "julia");
  });

  test("returns undefined for prose, fence lines themselves, and unsupported languages", () => {
    assert.strictEqual(quartoChunkLanguage(at, 0), undefined);
    assert.strictEqual(quartoChunkLanguage(at, 2), undefined);
    assert.strictEqual(quartoChunkLanguage(at, 6), undefined);
    assert.strictEqual(quartoChunkLanguage(at, 12), undefined);
    assert.strictEqual(quartoChunkLanguage(at, 18), undefined);
  });
});

suite("adjacent citations keep their own metadata", () => {
  const none = new Set<string>();

  test("two adjacent quarto html comments", () => {
    const text =
      "<!--\nZotero Reference:\n  Title: First Paper\n  Key: AAAA1111\n-->\n" +
      "<!--\nZotero Reference:\n  Title: Second Paper\n  Key: BBBB2222\n-->\n";
    assert.deepStrictEqual(findUnresolvedCitations(text, none).map((f) => [f.key, f.title]), [
      ["AAAA1111", "First Paper"],
      ["BBBB2222", "Second Paper"],
    ]);
  });

  test("two adjacent python docstrings", () => {
    const block = (t: string, k: string) => `"""\nZotero Reference:\n    Title: ${t}\n    Key: ${k}\n"""\n`;
    const found = findUnresolvedCitations(block("One", "AAAA1111") + block("Two", "BBBB2222"), none);
    assert.deepStrictEqual(found.map((f) => f.title), ["One", "Two"]);
  });

  test("two adjacent typst block comments and two adjacent R roxygen blocks", () => {
    const typst = (t: string, k: string) => `/*\nZotero Reference:\n  Title: ${t}\n  Key: ${k}\n*/\n`;
    assert.deepStrictEqual(
      findUnresolvedCitations(typst("T One", "AAAA1111") + typst("T Two", "BBBB2222"), none).map((f) => f.title),
      ["T One", "T Two"]
    );
    const r =
      "#'\n#' @ZoteroArticleIDs: AAAA1111\n#' @ZoteroArticleNames: R One\n#'\n" +
      "#'\n#' @ZoteroArticleIDs: BBBB2222\n#' @ZoteroArticleNames: R Two\n#'\n";
    assert.deepStrictEqual(findUnresolvedCitations(r, none).map((f) => f.title), ["R One", "R Two"]);
  });

  test("two adjacent typst // comment citations separated by a blank comment line", () => {
    const t =
      "// Zotero Reference\n// Title: Slash One\n// Zotero Key: AAAA1111\n" +
      "\n" +
      "// Zotero Reference\n// Title: Slash Two\n// Zotero Key: BBBB2222\n";
    assert.deepStrictEqual(findUnresolvedCitations(t, none).map((f) => f.title), ["Slash One", "Slash Two"]);
  });
});

suite("bib url field", () => {
  const base = { key: "K1", data: { itemType: "journalArticle", title: "A study", creators: [{ creatorType: "author", lastName: "Doe", firstName: "J" }], date: "2020" } };

  test("uses the paper's own URL, never the Zotero library page", () => {
    const withUrl = { ...base, links: { alternate: { href: "https://www.zotero.org/someone/items/K1" } }, data: { ...base.data, url: "https://example.org/paper" } };
    const text = bibtexForItems([withUrl]).text;
    assert.ok(text.includes("https://example.org/paper"));
    assert.ok(!text.includes("zotero.org"));
  });

  test("omits the url field when the paper has none", () => {
    const noUrl = { ...base, links: { alternate: { href: "https://www.zotero.org/someone/items/K1" } } };
    const text = bibtexForItems([noUrl]).text;
    assert.ok(!text.includes("url ="));
    assert.ok(!text.includes("zotero.org"));
  });
});
