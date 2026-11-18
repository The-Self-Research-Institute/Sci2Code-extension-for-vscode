import * as assert from "assert";
import { parseBibEntries } from "../features/bibtex";
import { itemsForProseKeys, proseCitationKeys, resolveProseKeys } from "../features/proseSync";

function item(key: string, data: any): any {
  return { key, data: { itemType: "journalArticle", ...data } };
}

const smith = item("AAAAAAAA", { title: "Adaptive Solvers", creators: [{ lastName: "Smith" }], date: "2024" });
const lee = item("BBBBBBBB", { title: "A Study", creators: [{ lastName: "Lee" }], date: "2022" });
const smithTwo = item("CCCCCCCC", { title: "Another Smith Paper", creators: [{ lastName: "Smith" }], date: "2024" });
const withBbt = item("DDDDDDDD", {
  title: "Custom Key Paper",
  creators: [{ lastName: "Okafor" }],
  date: "2021",
  extra: "Citation Key: okaforCustom2021",
});

suite("prose citations: finding keys", () => {
  test("quarto: bracketed, grouped and bare citations", () => {
    const text = "Solvers work [@smith2024; @lee2022, p. 4] and @hairer1996 agrees.";
    assert.deepStrictEqual(proseCitationKeys(text, "quarto"), ["smith2024", "lee2022", "hairer1996"]);
  });

  test("a trailing full stop or comma is not part of the key", () => {
    assert.deepStrictEqual(proseCitationKeys("See @smith2024. Also @lee2022, then.", "quarto"), ["smith2024", "lee2022"]);
  });

  test("keys with internal dots, colons and dashes are kept whole", () => {
    assert.deepStrictEqual(proseCitationKeys("[@doe.2020-b] and [@a:b]", "quarto"), ["doe.2020-b", "a:b"]);
  });

  test("quarto: cross-references, email addresses and duplicates are ignored", () => {
    const text = "See @fig-plot, @tbl-main, @sec-intro. Mail jane@lab.org. [@smith2024] again [@smith2024].";
    assert.deepStrictEqual(proseCitationKeys(text, "quarto"), ["smith2024"]);
  });

  test("quarto: front matter, code fences, comments and inline code are not prose", () => {
    const text = [
      "---",
      "title: Paper @fm",
      "---",
      "Real [@real2020].",
      "```{python}",
      "x = '@infence'",
      "```",
      "<!--",
      "Zotero Reference: @incomment",
      "-->",
      "Inline `@inline` code.",
      "~~~",
      "@tilde",
      "~~~",
    ].join("\n");
    assert.deepStrictEqual(proseCitationKeys(text, "quarto"), ["real2020"]);
  });

  test("keys with accented letters are read whole", () => {
    assert.deepStrictEqual(proseCitationKeys("[@müller2021] and @zoé2020.", "quarto"), ["müller2021", "zoé2020"]);
  });

  test("an @handle inside a URL or a Markdown link is not a citation", () => {
    assert.deepStrictEqual(
      proseCitationKeys("See https://twitter.com/@someone, [me](https://x.org/@person) and [@real2020]", "quarto"),
      ["real2020"]
    );
    assert.deepStrictEqual(proseCitationKeys("Visit https://example.com/@name and @real2020", "typst"), ["real2020"]);
  });

  test("suppress-author, locators and possessives still work", () => {
    assert.deepStrictEqual(proseCitationKeys("[-@smith2024] [@lee2022, p. 5] @hairer1996's", "quarto"), [
      "smith2024",
      "lee2022",
      "hairer1996",
    ]);
  });

  test("typst: bare keys, with comments and raw blocks ignored", () => {
    const text = ["As shown in @smith2024.", "// a note about @commented", "/* @block */", "`@raw`", "Also @lee2022"].join("\n");
    assert.deepStrictEqual(proseCitationKeys(text, "typst"), ["smith2024", "lee2022"]);
  });
});

suite("prose citations: matching the bibliography and the library", () => {
  const library = [smith, lee, smithTwo, withBbt];

  test("keys already in the bibliography need nothing", () => {
    const entries = parseBibEntries("@article{lee2022, title={A Study}}\n");
    const result = resolveProseKeys(["lee2022"], entries, library);
    assert.deepStrictEqual(result, { present: ["lee2022"], add: [], ambiguous: [], unknown: [] });
  });

  test("a missing key that matches exactly one paper is added", () => {
    const result = resolveProseKeys(["lee2022"], [], library);
    assert.deepStrictEqual(result.add.map((i) => i.key), ["BBBBBBBB"]);
    assert.deepStrictEqual(result.unknown, []);
  });

  test("a Better BibTeX key matches its paper", () => {
    const result = resolveProseKeys(["okaforCustom2021"], [], library);
    assert.deepStrictEqual(result.add.map((i) => i.key), ["DDDDDDDD"]);
  });

  test("a key that fits two papers is reported as ambiguous and not guessed", () => {
    const result = resolveProseKeys(["smith2024"], [], library);
    assert.deepStrictEqual(result.add, []);
    assert.deepStrictEqual(result.ambiguous, ["smith2024"]);
  });

  test("a key that fits no paper is reported as unknown", () => {
    const result = resolveProseKeys(["nobody1999", "figure1"], [], library);
    assert.deepStrictEqual(result.unknown, ["nobody1999", "figure1"]);
  });

  test("notes and attachments are never matched", () => {
    const note = item("EEEEEEEE", { itemType: "note", title: "Note", creators: [{ lastName: "Smith" }], date: "2024" });
    const result = resolveProseKeys(["smith2024"], [], [note, smith]);
    assert.deepStrictEqual(result.add.map((i) => i.key), ["AAAAAAAA"]);
  });

  test("a mix is sorted into the right groups", () => {
    const entries = parseBibEntries("@misc{lee2022, title={x}}\n");
    const result = resolveProseKeys(["lee2022", "okaforCustom2021", "smith2024", "ghost"], entries, library);
    assert.deepStrictEqual(result.present, ["lee2022"]);
    assert.deepStrictEqual(result.add.map((i) => i.key), ["DDDDDDDD"]);
    assert.deepStrictEqual(result.ambiguous, ["smith2024"]);
    assert.deepStrictEqual(result.unknown, ["ghost"]);
  });
});

suite("prose citations: papers for Generate Bibliography", () => {
  test("finds papers by the proposed key and by a key already in the .bib", () => {
    const entries = parseBibEntries("@article{lee2022,\n  title = {A Study},\n  year = {2022}\n}\n");
    const found = itemsForProseKeys(["smith2024", "lee2022"], entries, [smith, lee]);
    assert.deepStrictEqual(found.map((i) => i.key).sort(), ["AAAAAAAA", "BBBBBBBB"]);
  });

  test("a key that fits two papers is left out", () => {
    assert.deepStrictEqual(itemsForProseKeys(["smith2024"], [], [smith, smithTwo]), []);
  });

  test("keys that match nothing give no papers", () => {
    assert.deepStrictEqual(itemsForProseKeys(["nobody1900"], [], [smith, lee]), []);
  });
});
