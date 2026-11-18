// Pure helpers (no `vscode` import) so they can be unit tested directly.

export type FunctionLang = "javascript" | "python" | "r" | "julia" | "quarto" | "typst";

const LANGUAGE_ALIASES: Record<string, FunctionLang> = {
  javascript: "javascript",
  javascriptreact: "javascript",
  typescript: "javascript",
  typescriptreact: "javascript",
  python: "python",
  r: "r",
  julia: "julia",
  quarto: "quarto",
  typst: "typst",
};

/** Maps a VS Code language id (e.g. `typescriptreact`) to the extractor to use. */
export function functionLanguage(languageId: string): FunctionLang | undefined {
  return LANGUAGE_ALIASES[languageId];
}

/** Returns the name of the function or class defined on `lineText`, if any. */
export function extractFunctionName(lineText: string, lang: FunctionLang): string | null {
  let match: RegExpMatchArray | null = null;
  switch (lang) {
    case "javascript":
      match =
        lineText.match(/function\s+(\w+)\s*\(/) ||
        lineText.match(/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/) ||
        // const name = (args) => ..., const name = async x => ..., const name = function
        lineText.match(
          /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::\s*[^=]+)?=>|\w+\s*=>)/
        );
      return match ? match[1] : null;
    case "python":
      match = lineText.match(/def\s+(\w+)\s*\(/);
      return match ? match[1] : null;
    case "r":
      match = lineText.match(/(\w+)\s*<-\s*function\s*\(/);
      return match ? match[1] : null;
    case "julia":
      match = lineText.match(/^\s*function\s+([\w\.]+)/);
      return match ? match[1] : null;
    case "typst":
      // `#let name(args) = ...` (function) or `#let name = ...` (value)
      match = lineText.match(/^\s*#let\s+([\w-]+)/);
      return match ? match[1] : null;
    case "quarto":
      // Quarto code chunks hold R, Python or Julia definitions.
      match =
        lineText.match(/^\s*def\s+(\w+)\s*\(/) ||
        lineText.match(/^\s*(\w+)\s*<-\s*function\s*\(/) ||
        lineText.match(/^\s*function\s+([\w\.]+)/);
      return match ? match[1] : null;
  }
  return null;
}

/** First function defined at or after `fromLine`, using the extractor for `languageId`. */
export function findFunctionNameFrom(
  lines: { count: number; at: (index: number) => string },
  languageId: string,
  fromLine: number
): string | null {
  const lang = functionLanguage(languageId);
  if (!lang) {
    return null;
  }
  for (let i = Math.max(0, fromLine); i < lines.count; i++) {
    const name = extractFunctionName(lines.at(i), lang);
    if (name) {
      return name;
    }
  }
  return null;
}
