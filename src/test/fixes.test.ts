import * as assert from "assert";
import {
  extractFunctionName,
  findFunctionNameFrom,
  functionLanguage,
} from "../utils/functionName";
import {
  commentSafe,
  creatorDisplayName,
  creatorsText,
  doiLink,
  doiMarkdownLink,
  escapeSnippetText,
  renderTemplateText,
} from "../features/snippetText";
import { findUnresolvedCitations } from "../panel/libraryModel";

suite("function names", () => {
  test("maps language ids to extractors", () => {
    assert.strictEqual(functionLanguage("typescriptreact"), "javascript");
    assert.strictEqual(functionLanguage("python"), "python");
    assert.strictEqual(functionLanguage("quarto"), "quarto");
    assert.strictEqual(functionLanguage("rust"), undefined);
  });

  test("python, r, julia, typst and quarto are detected (were all null before)", () => {
    assert.strictEqual(extractFunctionName("async def run_step(state):", "python"), "run_step");
    assert.strictEqual(extractFunctionName("solve <- function(x) {", "r"), "solve");
    assert.strictEqual(extractFunctionName("function Solver.step(x)", "julia"), "Solver.step");
    assert.strictEqual(extractFunctionName("#let run-step(state) = state", "typst"), "run-step");
    assert.strictEqual(extractFunctionName("def integrate(f):", "quarto"), "integrate");
    assert.strictEqual(extractFunctionName("estimate <- function(x)", "quarto"), "estimate");
  });

  test("javascript and typescript: functions, arrows and classes", () => {
    const js = (line: string) => extractFunctionName(line, "javascript");
    assert.strictEqual(js("export async function load(id) {"), "load");
    assert.strictEqual(js("const add = (a, b) => a + b;"), "add");
    assert.strictEqual(js("export const fetchAll = async (url: string): Promise<void> => {"), "fetchAll");
    assert.strictEqual(js("const double = x => x * 2"), "double");
    assert.strictEqual(js("let handler = function () {"), "handler");
    assert.strictEqual(js("export default class Solver extends Base {"), "Solver");
    assert.strictEqual(js("const value = 42;"), null);
    assert.strictEqual(js("const total = (1 + 2) * 3;"), null);
  });

  test("finds the first definition at or after the cursor line", () => {
    const lines = ["# note", "x = 1", "def first():", "def second():"];
    const doc = { count: lines.length, at: (i: number) => lines[i] };
    assert.strictEqual(findFunctionNameFrom(doc, "python", 0), "first");
    assert.strictEqual(findFunctionNameFrom(doc, "python", 3), "second");
    assert.strictEqual(findFunctionNameFrom(doc, "python", 4), null);
    assert.strictEqual(findFunctionNameFrom(doc, "rust", 0), null);
  });
});

suite("template text", () => {
  test("escapes characters a SnippetString would otherwise interpret", () => {
    assert.strictEqual(escapeSnippetText("Cost of $HOME and ${1:x}"), "Cost of \\$HOME and \\${1:x\\}");
    assert.strictEqual(escapeSnippetText("a\\b"), "a\\\\b");
    assert.strictEqual(escapeSnippetText("plain title"), "plain title");
  });

  test("creators never render as 'undefined'", () => {
    assert.strictEqual(
      creatorsText([{ firstName: "Jane", lastName: "Smith" }, { name: "WHO Collaboration" }, { lastName: "Plato" }]),
      "Jane Smith, WHO Collaboration, Plato"
    );
    assert.strictEqual(creatorsText([]), "N/A");
    assert.strictEqual(creatorsText(undefined), "N/A");
    assert.strictEqual(creatorDisplayName({}), "");
  });
});

suite("unresolved citations in every template", () => {
  const known = new Set<string>();

  test("python docstring", () => {
    const text = [
      '"""',
      "Zotero Reference:",
      "    Title: Adaptive Solvers",
      "    Authors: Jane Smith",
      "    DOI: 10.1/abc",
      "    URL: https://x.org/p",
      "    Key: ABCD2345",
      "    CodeID: 12ab34cd",
      '"""',
      "def run(): pass",
    ].join("\n");
    assert.deepStrictEqual(findUnresolvedCitations(text, known), [
      { key: "ABCD2345", title: "Adaptive Solvers", doi: "10.1/abc", url: "https://x.org/p" },
    ]);
  });

  test("R roxygen (colon after the tag)", () => {
    const text = [
      "#'",
      "#' @ZoteroArticleIDs: ZZZZ9999",
      "#' @ZoteroArticleNames: Linear Models in R",
      "#' @ZoteroDOI: 10.2/r",
      "#'",
      "f <- function(x) x",
    ].join("\n");
    const [found] = findUnresolvedCitations(text, known);
    assert.strictEqual(found.key, "ZZZZ9999");
    assert.strictEqual(found.title, "Linear Models in R");
    assert.strictEqual(found.doi, "10.2/r");
  });

  test("quarto html comment and typst block comment", () => {
    const quarto = "<!--\nZotero Reference:\n  Title: Chunked Reports\n  Key: QQQQ2222\n-->\n";
    const typst = "/*\nZotero Reference:\n  Title: Typeset Maths\n  Key: TTTT3333\n*/\n";
    assert.strictEqual(findUnresolvedCitations(quarto, known)[0].title, "Chunked Reports");
    assert.strictEqual(findUnresolvedCitations(typst, known)[0].title, "Typeset Maths");
  });

  test("two citations in one file keep their own titles (CRLF too)", () => {
    const block = (title: string, key: string) =>
      `"""\r\nZotero Reference:\r\n    Title: ${title}\r\n    Key: ${key}\r\n"""\r\ndef f(): pass\r\n\r\n`;
    const found = findUnresolvedCitations(block("First Paper", "AAAA1111") + block("Second Paper", "BBBB2222"), known);
    assert.deepStrictEqual(found.map((f) => [f.key, f.title]), [
      ["AAAA1111", "First Paper"],
      ["BBBB2222", "Second Paper"],
    ]);
  });

  test("known keys and N/A values are not reported", () => {
    const text = "Key: ABCD2345\n\n/**\n * @ZoteroArticleIDs EEEE5555\n * @ZoteroArticleNames N/A\n */\n";
    const found = findUnresolvedCitations(text, new Set(["ABCD2345"]));
    assert.deepStrictEqual(found, [{ key: "EEEE5555", title: "EEEE5555", doi: "", url: "" }]);
  });
});

suite("template rendering", () => {
  const item = {
    key: "ABCD2345",
    data: {
      title: "Adaptive Solvers",
      creators: [{ firstName: "Jane", lastName: "Smith" }],
      date: "March 2024",
      DOI: "10.1/abc",
    },
    links: { alternate: { href: "https://zotero.org/x" } },
  };
  const meta = { codeId: "12ab34cd", functionName: "run" };
  const render = (template: string, lang: string, it: any = item) =>
    renderTemplateText(template, it, meta, lang).text;

  test("year is the four-digit year, date is kept as stored", () => {
    assert.strictEqual(render("Year: ${zotero.year}", "python"), "Year: 2024");
    assert.strictEqual(render("Date: ${zotero.date}", "python"), "Date: March 2024");
  });

  test("lines whose optional values are missing are dropped, others keep N/A", () => {
    const bare = { key: "ZZZZ9999", data: { title: "No Extras", creators: [] } };
    const text = render(
      ["Title: ${zotero.title}", "Authors: ${zotero.creators}", "Year: ${zotero.year}", "DOI: ${zotero.DOI}", "URL: ${zotero.url}", "Key: ${zotero.key}"].join("\n"),
      "python",
      bare
    );
    assert.strictEqual(text, ["Title: No Extras", "Authors: N/A", "Key: ZZZZ9999"].join("\n"));
  });

  test("a line mixing a missing optional with a present value stays", () => {
    const bare = { key: "ZZZZ9999", data: { title: "T" } };
    assert.strictEqual(render("Cite: ${zotero.title} (${zotero.year})", "python", bare), "Cite: T (N/A)");
  });

  test("lines without placeholders are untouched", () => {
    assert.strictEqual(render('"""\nZotero Reference:\n"""', "python"), '"""\nZotero Reference:\n"""');
  });

  test("unknown placeholders are reported, known ones are not", () => {
    const result = renderTemplateText("${zotero.nope} ${zotero.title} ${code.id} ${code.what}", item, meta, "python");
    assert.deepStrictEqual(result.unknown.sort(), ["${code.what}", "${zotero.nope}"]);
  });

  test("snippet characters in values are escaped after comment escaping", () => {
    const tricky = { key: "K", data: { title: "Cost $5 {x}" } };
    assert.strictEqual(render("${zotero.title}", "default", tricky), "Cost \\$5 {x\\}");
  });
});

suite("comment-safe values", () => {
  test("flattens newlines everywhere", () => {
    assert.strictEqual(commentSafe("r", "Two\nline  \r\n title"), "Two line title");
  });

  test("a title cannot close a JS, TS or Typst block comment", () => {
    for (const lang of ["javascript", "typescript", "typescriptreact", "typst"]) {
      assert.ok(!commentSafe(lang, "A */ B").includes("*/"), lang);
    }
    assert.ok(!commentSafe("typst", "A /* B").includes("/*"));
  });

  test("a title cannot close a Quarto HTML comment", () => {
    assert.ok(!commentSafe("quarto", "A --> B").includes("-->"));
  });

  test("python and julia: triple quotes and backslashes cannot break the docstring", () => {
    const out = commentSafe("python", 'Say """hi""" in C:\\users\\x');
    assert.ok(!out.includes('"""'));
    assert.ok(out.includes("C:\\\\users\\\\x"));
    assert.strictEqual(commentSafe("julia", "Cost $5"), "Cost \\$5");
  });

  test("ordinary titles pass through unchanged", () => {
    for (const lang of ["python", "javascript", "quarto", "typst", "r", "julia"]) {
      assert.strictEqual(commentSafe(lang, "Adaptive Solvers: a review (2024)"), "Adaptive Solvers: a review (2024)");
    }
  });
});

suite("DOI links in templates", () => {
  const item = {
    key: "ABCD2345",
    data: { title: "T", creators: [], date: "2024", DOI: "10.1071/AH23152" },
    links: {},
  };
  const meta = { codeId: "x", functionName: null };

  test("doiLink builds a doi.org link and never doubles the prefix", () => {
    assert.strictEqual(doiLink("10.1071/AH23152"), "https://doi.org/10.1071/AH23152");
    assert.strictEqual(doiLink("https://doi.org/10.1/x"), "https://doi.org/10.1/x");
    assert.strictEqual(doiLink("http://dx.doi.org/10.1/x"), "https://doi.org/10.1/x");
    assert.strictEqual(doiLink("doi:10.1/x"), "https://doi.org/10.1/x");
    assert.strictEqual(doiLink(""), undefined);
    assert.strictEqual(doiLink(undefined), undefined);
  });

  test("the placeholder renders a link, and the line is left out without a DOI", () => {
    const withDoi = renderTemplateText("DOI: ${zotero.doiUrl}", item, meta, "python").text;
    assert.strictEqual(withDoi, "DOI: https://doi.org/10.1071/AH23152");
    const bare = { key: "K", data: { title: "T", creators: [] } };
    assert.strictEqual(renderTemplateText("A\nDOI: ${zotero.doiUrl}\nB", bare, meta, "python").text, "A\nB");
  });

  test("the default templates keep the plain DOI, not a link, in the citation comment", () => {
    const templates = require("../../package.json").contributes.configuration.properties["sci2code.templates"].default;
    for (const language of Object.keys(templates)) {
      const template = templates[language].join("\n");
      assert.ok(template.includes("${zotero.DOI}"), language);
      assert.ok(!template.includes("${zotero.doiUrl}"), language);
      const rendered = renderTemplateText(template, item, meta, language).text;
      assert.ok(rendered.includes("10.1071/AH23152"), language);
      assert.ok(!rendered.includes("https://doi.org/"), language);
    }
  });

  test("the hover shows the DOI as a markdown link that survives odd DOIs", () => {
    assert.strictEqual(
      doiMarkdownLink("10.1071/AH23152"),
      "[10.1071/AH23152](https://doi.org/10.1071/AH23152)"
    );
    assert.strictEqual(
      doiMarkdownLink("10.1002/(SICI)1097-4571"),
      "[10.1002/(SICI)1097-4571](https://doi.org/10.1002/%28SICI%291097-4571)"
    );
    assert.strictEqual(doiMarkdownLink("https://doi.org/10.1/x"), "[10.1/x](https://doi.org/10.1/x)");
    assert.strictEqual(doiMarkdownLink(undefined), undefined);
    assert.strictEqual(doiMarkdownLink(""), undefined);
  });

  test("comments written with a DOI link are still read back as a bare DOI", () => {
    const python = ['"""', "Zotero Reference:", "    Title: A Paper", "    DOI: https://doi.org/10.1/abc", "    Key: ABCD2345", '"""'].join("\n");
    assert.strictEqual(findUnresolvedCitations(python, new Set())[0].doi, "10.1/abc");
    const js = ["/**", " * @ZoteroArticleIDs EEEE5555", " * @ZoteroArticleNames A Paper", " * @ZoteroDOI https://doi.org/10.2/xyz", " */"].join("\n");
    assert.strictEqual(findUnresolvedCitations(js, new Set())[0].doi, "10.2/xyz");
    const old = ['"""', "    Title: Old", "    DOI: 10.3/old", "    Key: FFFF6666", '"""'].join("\n");
    assert.strictEqual(findUnresolvedCitations(old, new Set())[0].doi, "10.3/old");
  });
});
