import * as assert from "assert";
import {
  completionPath,
  findTrigger,
  isProseTrigger,
  proseTriggers,
  triggersFor,
} from "../features/triggerRules";
import { inQuartoFrontMatter } from "../utils/quartoChunk";

suite("trigger scoping", () => {
  const languageSpecific = {
    quarto: ["&&", "@@"],
    python: ['"""', "#"],
    typst: ["//"],
  };

  test("a trigger set for one language does not fire in another", () => {
    assert.deepStrictEqual(triggersFor("typst", ["&&"], languageSpecific), ["&&", "//"]);
    assert.ok(!triggersFor("typst", ["&&"], languageSpecific).includes("@@"));
    assert.ok(!triggersFor("javascript", ["/**"], languageSpecific).includes("&&"));
    assert.ok(!triggersFor("quarto", [], languageSpecific).includes('"""'));
  });

  test("global triggers apply to every language and duplicates are removed", () => {
    assert.deepStrictEqual(triggersFor("quarto", ["&&"], languageSpecific), ["&&", "@@"]);
    assert.deepStrictEqual(triggersFor("typst", ["&&"], languageSpecific), ["&&", "//"]);
    assert.deepStrictEqual(triggersFor("rust", ["&&"], languageSpecific), ["&&"]);
  });

  test("missing or empty settings are tolerated", () => {
    assert.deepStrictEqual(triggersFor("quarto", undefined, undefined), []);
    assert.deepStrictEqual(triggersFor("quarto", ["", "&&"], {}), ["&&"]);
  });
});

suite("finding a typed trigger", () => {
  test("matches the trigger at the end of the text before the cursor", () => {
    assert.deepStrictEqual(findTrigger("foo &&", "", ["&&"]), { trigger: "&&", start: 4, end: 6 });
    assert.deepStrictEqual(findTrigger("&& ", "", ["&&"]), { trigger: "&&", start: 0, end: 3 });
  });

  test("does not match when the trigger is not last", () => {
    assert.strictEqual(findTrigger("&& and more", "", ["&&"]), null);
    assert.strictEqual(findTrigger("one &", "", ["&&"]), null);
  });

  test("the longest trigger wins", () => {
    assert.strictEqual(findTrigger("#'", "", ["#", "#'"])?.trigger, "#'");
    assert.strictEqual(findTrigger("/**", "", ["/*", "/**"])?.trigger, "/**");
  });

  test("a closing delimiter after the cursor is included in the range", () => {
    assert.deepStrictEqual(findTrigger('  """', '"""', ['"""']), { trigger: '"""', start: 2, end: 8 });
    assert.deepStrictEqual(findTrigger("/**", " */", ["/**"]), { trigger: "/**", start: 0, end: 6 });
    assert.deepStrictEqual(findTrigger("<!--", "-->", ["<!--"]), { trigger: "<!--", start: 0, end: 7 });
  });

  test("a repeated-character trigger does not fire inside a longer run", () => {
    assert.strictEqual(findTrigger("#####", "", ["#"]), null);
    assert.strictEqual(findTrigger("##", "", ["#"]), null);
    assert.strictEqual(findTrigger("#", "", ["#"])?.trigger, "#");
    assert.strictEqual(findTrigger("## ", "", ["#", "##", "###"])?.trigger, "##");
    assert.strictEqual(findTrigger("#####", "", ["#", "##", "###"]), null);
    assert.strictEqual(findTrigger("text #", "", ["#"])?.trigger, "#");
  });

  test("special characters in a trigger are matched literally", () => {
    assert.deepStrictEqual(findTrigger("a.*", "", [".*"]), { trigger: ".*", start: 1, end: 3 });
    assert.strictEqual(findTrigger("abc", "", [".*"]), null);
  });
});

suite("prose triggers", () => {
  test("comment markers are not prose triggers, custom ones are", () => {
    for (const marker of ["#", "#'", '"""', "<!--", "/**", "//", "/*"]) {
      assert.strictEqual(isProseTrigger(marker), false, marker);
    }
    assert.deepStrictEqual(proseTriggers(["&&", "#", "//", "@@", "::"]), ["&&", "@@", "::"]);
  });
});

suite("quarto front matter", () => {
  const doc = ["---", "title: x", "bibliography: a.bib", "---", "Prose here", "```{python}", "x = 1", "```"];
  const at = (i: number) => doc[i];

  test("lines between the dashes are front matter, prose after them is not", () => {
    assert.strictEqual(inQuartoFrontMatter(at, doc.length, 0), true);
    assert.strictEqual(inQuartoFrontMatter(at, doc.length, 1), true);
    assert.strictEqual(inQuartoFrontMatter(at, doc.length, 3), true);
    assert.strictEqual(inQuartoFrontMatter(at, doc.length, 4), false);
    assert.strictEqual(inQuartoFrontMatter(at, doc.length, 6), false);
  });

  test("a document without front matter, or with an unclosed one, has none", () => {
    const plain = ["# Title", "text"];
    assert.strictEqual(inQuartoFrontMatter((i) => plain[i], plain.length, 1), false);
    const unclosed = ["---", "text", "more"];
    assert.strictEqual(inQuartoFrontMatter((i) => unclosed[i], unclosed.length, 1), false);
    assert.strictEqual(inQuartoFrontMatter(() => "", 0, 0), false);
  });
});

suite("which list appears (the && scenario)", () => {
  const globalTriggers = ["//", '"""', "#", "#'", "/**", "&&"];
  const languageSpecific = { quarto: ["&&"] };

  function pathFor(languageId: string, typed: string, functionName: string | null, inProse: boolean) {
    const triggers = triggersFor(languageId, globalTriggers, languageSpecific);
    const match = findTrigger(typed, "", triggers);
    return completionPath(languageId, match ? match.trigger : null, functionName, inProse);
  }

  test("quarto prose: && lists your papers to cite in the text", () => {
    assert.strictEqual(pathFor("quarto", "As shown by &&", null, true), "prose");
  });

  test("quarto: && above a function in a code chunk gives the reference comment", () => {
    assert.strictEqual(pathFor("quarto", "&&", "run_step", false), "function");
    assert.strictEqual(pathFor("quarto", "&&", "run_step", true), "prose");
  });

  test("typst: && above a #let cites like the sidebar, a comment marker gives the reference comment", () => {
    assert.strictEqual(pathFor("typst", "&&", "run_step", true), "prose");
    assert.strictEqual(pathFor("typst", "//", "run_step", true), "function");
    assert.strictEqual(pathFor("typst", "//", null, true), "none");
    assert.strictEqual(pathFor("typst", "As shown by &&", null, true), "prose");
  });

  test("typing # for a heading in a quarto document does not open the list", () => {
    assert.strictEqual(pathFor("quarto", "#", null, true), "none");
    assert.strictEqual(pathFor("quarto", "## Introduction #", null, true), "none");
  });

  test("quarto text: <!-- on its own line gives the reference comment, # does not", () => {
    const triggers = ["<!--", "#", "&&"];
    const path = (typed: string, inProse: boolean) => {
      const match = findTrigger(typed, "", triggers);
      return completionPath("quarto", match ? match.trigger : null, null, inProse);
    };
    assert.strictEqual(path("<!--", true), "reference");
    assert.strictEqual(path("<!--", false), "none");
    assert.strictEqual(path("#", true), "none");
    assert.strictEqual(path("&&", true), "prose");
  });

  test("a code file without a function below the trigger gets nothing", () => {
    assert.strictEqual(pathFor("python", "&&", null, false), "none");
  });

  test("a trigger set only for quarto does not fire in typst", () => {
    const triggers = triggersFor("typst", ["#"], { quarto: ["&&"] });
    assert.strictEqual(findTrigger("text &&", "", triggers), null);
    assert.strictEqual(completionPath("typst", null, null, true), "none");
  });

  test("no trigger, no list", () => {
    assert.strictEqual(pathFor("quarto", "plain words", null, true), "none");
  });
});
