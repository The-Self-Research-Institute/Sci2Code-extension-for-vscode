import * as assert from "assert";
import { parseBibEntries, planBibSync } from "../features/bibtex";
import { CiteOutcome, CitePorts, citeInText, isCitationTrigger, proseCitation } from "../features/citeFlow";
import { inQuartoFence } from "../utils/quartoChunk";

function item(key: string, data: any): any {
  return { key, data: { itemType: "journalArticle", ...data } };
}

const smith = item("AAAAAAAA", {
  title: "Adaptive Solvers for Stiff Systems",
  creators: [{ creatorType: "author", firstName: "Jane", lastName: "Smith" }],
  date: "2024",
  DOI: "10.1000/smith.2024",
});

interface Env {
  files: Record<string, string>;
  declared: string[];
  confirm: boolean;
  chooseIndex: number | undefined;
  unchanged: () => boolean;
  applyResult: boolean;
  appendThrows?: string;
  calls: { append: number; choose: number; confirm: number; apply: Array<{ citation: string; declare: string | undefined }> };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    files: {},
    declared: ["refs.bib"],
    confirm: true,
    chooseIndex: 0,
    unchanged: () => true,
    applyResult: true,
    calls: { append: 0, choose: 0, confirm: 0, apply: [] },
    ...overrides,
  };
}

function portsFor(env: Env, target: any): CitePorts<string> {
  return {
    declared: async () => env.declared,
    fallback: () => "references.bib",
    entries: async (files) => files.flatMap((f) => parseBibEntries(env.files[f] ?? "")),
    choose: async (files) => {
      env.calls.choose++;
      return env.chooseIndex === undefined ? undefined : files[env.chooseIndex];
    },
    confirmDeclaration: async () => {
      env.calls.confirm++;
      return env.confirm;
    },
    append: async (file, others) => {
      env.calls.append++;
      if (env.appendThrows) {
        throw new Error(env.appendThrows);
      }
      const plan = planBibSync([env.files[file] ?? "", ...others.map((o) => env.files[o] ?? "")], [target]);
      if (plan.append) {
        env.files[file] = (env.files[file] ?? "") + plan.append;
      }
      return plan;
    },
    unchanged: env.unchanged,
    apply: async (citation, declare) => {
      env.calls.apply.push({ citation, declare });
      return env.applyResult;
    },
  };
}

const run = (env: Env, target: any = smith, language: "quarto" | "typst" = "quarto", before = "see this "): Promise<CiteOutcome> =>
  citeInText(target, { language, before }, portsFor(env, target));

const entryCount = (env: Env, file: string) => parseBibEntries(env.files[file] ?? "").length;

suite("cite in text: existing paper", () => {
  test("reuses the key already in a declared bibliography without writing", async () => {
    const env = makeEnv({ files: { "refs.bib": "@article{kept_by_hand, title={x}, doi={10.1000/SMITH.2024}}\n" } });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "cited", key: "kept_by_hand", saved: false });
    assert.strictEqual(env.calls.append, 0);
    assert.deepStrictEqual(env.calls.apply, [{ citation: "[@kept_by_hand]", declare: undefined }]);
  });

  test("a Typst citation is a bare @key", async () => {
    const env = makeEnv({ files: { "refs.bib": "@article{kept, doi={10.1000/smith.2024}}\n" } });
    await run(env, smith, "typst", "as shown in ");
    assert.strictEqual(env.calls.apply[0].citation, "@kept");
  });

  test("checks every declared bibliography before adding an entry", async () => {
    const env = makeEnv({
      declared: ["a.bib", "b.bib"],
      files: { "a.bib": "", "b.bib": "@article{inb, doi={10.1000/smith.2024}}\n" },
    });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "cited", key: "inb", saved: false });
    assert.strictEqual(env.calls.choose, 0);
    assert.strictEqual(env.calls.append, 0);
  });
});

suite("cite in text: new paper", () => {
  test("saves the entry first, then inserts the final key", async () => {
    const env = makeEnv({ files: { "refs.bib": "@misc{other, title={Other}}\n" } });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "cited", key: "smith2024", saved: true });
    assert.strictEqual(entryCount(env, "refs.bib"), 2);
    assert.deepStrictEqual(env.calls.apply, [{ citation: "[@smith2024]", declare: undefined }]);
  });

  test("uses the final key even when the proposed one is taken", async () => {
    const env = makeEnv({ files: { "refs.bib": "@article{smith2024, title={Another}, doi={10.9/x}}\n" } });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "cited", key: "smith2024a", saved: true });
    assert.strictEqual(env.calls.apply[0].citation, "[@smith2024a]");
  });

  test("several declared files: asks which one and writes only there", async () => {
    const env = makeEnv({ declared: ["a.bib", "b.bib"], files: { "a.bib": "", "b.bib": "" }, chooseIndex: 1 });
    const outcome = await run(env);
    assert.strictEqual(outcome.status, "cited");
    assert.strictEqual(env.calls.choose, 1);
    assert.strictEqual(entryCount(env, "a.bib"), 0);
    assert.strictEqual(entryCount(env, "b.bib"), 1);
  });
});

suite("cite in text: nothing declared", () => {
  test("cancelled confirmation leaves the manuscript and files untouched", async () => {
    const env = makeEnv({ declared: [], confirm: false });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "cancelled" });
    assert.strictEqual(env.calls.append, 0);
    assert.strictEqual(env.calls.apply.length, 0);
    assert.deepStrictEqual(env.files, {});
  });

  test("confirmed: creates the fallback file and declares it together with the citation", async () => {
    const env = makeEnv({ declared: [], confirm: true });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "cited", key: "smith2024", saved: true });
    assert.strictEqual(entryCount(env, "references.bib"), 1);
    assert.deepStrictEqual(env.calls.apply, [{ citation: "[@smith2024]", declare: "references.bib" }]);
  });

  test("an undeclared references.bib that already has the paper is reused, not duplicated", async () => {
    const env = makeEnv({
      declared: [],
      files: { "references.bib": "@article{old_key, doi={10.1000/smith.2024}}\n" },
    });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "cited", key: "old_key", saved: false });
    assert.strictEqual(entryCount(env, "references.bib"), 1);
    assert.strictEqual(env.calls.apply[0].declare, "references.bib");
  });

  test("cancelling the file picker also changes nothing", async () => {
    const env = makeEnv({ declared: ["a.bib", "b.bib"], chooseIndex: undefined });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "cancelled" });
    assert.strictEqual(env.calls.append, 0);
    assert.strictEqual(env.calls.apply.length, 0);
  });
});

suite("cite in text: failures", () => {
  test("a failed write leaves the manuscript untouched", async () => {
    const env = makeEnv({ appendThrows: "refs.bib has unsaved changes." });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "write-failed", message: "refs.bib has unsaved changes." });
    assert.strictEqual(env.calls.apply.length, 0);
  });

  test("an invalid custom key is rejected before anything is inserted or written", async () => {
    const bad = item("BBBBBBBB", { ...smith.data, DOI: "10.9/bad", extra: "Citation Key: bad,key" });
    const env = makeEnv({ files: { "refs.bib": "@misc{keep, title={Keep}}\n" } });
    const outcome = await run(env, bad);
    assert.deepStrictEqual(outcome, { status: "invalid" });
    assert.strictEqual(env.calls.apply.length, 0);
    assert.strictEqual(entryCount(env, "refs.bib"), 1);
  });

  test("a document that changed while saving is not edited, and the saved key is reported", async () => {
    const env = makeEnv({ unchanged: () => false });
    const outcome = await run(env);
    assert.deepStrictEqual(outcome, { status: "document-changed", key: "smith2024" });
    assert.strictEqual(env.calls.apply.length, 0);
    assert.strictEqual(entryCount(env, "refs.bib"), 1);
  });

  test("when the editor rejects the edit the entry stays saved and the retry reuses its key", async () => {
    const env = makeEnv({ applyResult: false });
    const first = await run(env);
    assert.deepStrictEqual(first, { status: "not-inserted", key: "smith2024" });
    assert.strictEqual(entryCount(env, "refs.bib"), 1);

    env.applyResult = true;
    const retry = await run(env);
    assert.deepStrictEqual(retry, { status: "cited", key: "smith2024", saved: false });
    assert.strictEqual(entryCount(env, "refs.bib"), 1);
  });

  test("retry after a rejected edit with nothing declared still adds only one entry", async () => {
    const env = makeEnv({ declared: [], applyResult: false });
    const first = await run(env);
    assert.strictEqual(first.status, "not-inserted");
    env.applyResult = true;
    const retry = await run(env);
    assert.deepStrictEqual(retry, { status: "cited", key: "smith2024", saved: false });
    assert.strictEqual(entryCount(env, "references.bib"), 1);
    assert.strictEqual(env.calls.apply[1].declare, "references.bib");
  });
});

suite("prose citation text", () => {
  test("quarto: plain prose gets brackets, with a space after a word", () => {
    assert.strictEqual(proseCitation("quarto", "k", "as shown "), "[@k]");
    assert.strictEqual(proseCitation("quarto", "k", ""), "[@k]");
    assert.strictEqual(proseCitation("quarto", "k", "word"), " [@k]");
    assert.strictEqual(proseCitation("quarto", "k", "[@a] text "), "[@k]");
  });

  test("quarto: inside brackets no duplicate brackets are created", () => {
    assert.strictEqual(proseCitation("quarto", "k", "text ["), "@k");
    assert.strictEqual(proseCitation("quarto", "k", "text [see "), "@k");
    assert.strictEqual(proseCitation("quarto", "k", "text [@a"), "; @k");
    assert.strictEqual(proseCitation("quarto", "k", "text [@a; "), "@k");
    assert.strictEqual(proseCitation("quarto", "k", "text [@a;"), " @k");
  });

  test("typst: a bare @key, with a space after a word", () => {
    assert.strictEqual(proseCitation("typst", "k", "as shown in "), "@k");
    assert.strictEqual(proseCitation("typst", "k", "word"), " @k");
  });
});

suite("@ trigger rules", () => {
  test("fires at line start, after whitespace and opening punctuation", () => {
    for (const before of ["", "see ", "text [", "a; ", "x, ", "(", "{"]) {
      assert.strictEqual(isCitationTrigger(before), true, JSON.stringify(before));
    }
  });

  test("does not fire inside an email address or a word", () => {
    for (const before of ["name", "user.name", "a1"]) {
      assert.strictEqual(isCitationTrigger(before), false, JSON.stringify(before));
    }
  });

  test("not offered inside any Quarto code fence", () => {
    const doc = ["prose", "```{python}", "x = 1", "```", "more prose", "```bash", "ls", "```"];
    const at = (i: number) => doc[i];
    assert.strictEqual(inQuartoFence(at, 0), false);
    assert.strictEqual(inQuartoFence(at, 2), true);
    assert.strictEqual(inQuartoFence(at, 4), false);
    assert.strictEqual(inQuartoFence(at, 6), true);
  });
});
