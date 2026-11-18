import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "test" ? [] : sourceFiles(full);
    }
    return full.endsWith(".ts") ? [full] : [];
  });
}

const source = sourceFiles(path.join(root, "src"))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

const declared: string[] = pkg.contributes.commands.map((c: { command: string }) => c.command);
const walkthrough = pkg.contributes.walkthroughs[0];

suite("extension manifest", () => {
  test("every contributed command is registered somewhere in the source", () => {
    for (const id of declared) {
      assert.ok(source.includes(`"${id}"`), `${id} is declared in package.json but never used in src`);
    }
  });

  test("the walkthrough links only to commands that exist", () => {
    const linked = new Set<string>();
    for (const step of walkthrough.steps) {
      for (const match of step.description.matchAll(/command:([\w.]+)/g)) {
        linked.add(match[1]);
      }
      for (const event of step.completionEvents ?? []) {
        linked.add(String(event).replace("onCommand:", ""));
      }
    }
    assert.ok(linked.size > 0);
    for (const id of linked) {
      assert.ok(declared.includes(id), `${id} is linked from the walkthrough but not contributed`);
    }
  });

  test("every walkthrough step has a page that exists and is not empty", () => {
    for (const step of walkthrough.steps) {
      const file = path.join(root, step.media.markdown);
      assert.ok(fs.existsSync(file), `${step.media.markdown} is missing`);
      assert.ok(fs.readFileSync(file, "utf8").trim().length > 40, `${step.media.markdown} is empty`);
    }
  });

  test("the walkthrough id in the code matches the package", () => {
    const expected = `${pkg.publisher}.${pkg.name}#${walkthrough.id}`;
    assert.ok(source.includes(`"${expected}"`), `expected the code to open ${expected}`);
  });

  test("publishing does not depend on pnpm and the keyword list is within the Marketplace limit", () => {
    assert.ok(!/pnpm/.test(pkg.scripts["vscode:prepublish"]));
    assert.ok(pkg.keywords.length <= 30);
    assert.ok(pkg.keywords.includes("quarto") && pkg.keywords.includes("typst") && pkg.keywords.includes("bibtex"));
  });
});
