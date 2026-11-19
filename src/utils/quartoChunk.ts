const CHUNK_LANGUAGES: Record<string, string> = {
  python: "python",
  py: "python",
  r: "r",
  julia: "julia",
  ojs: "javascript",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
};

const FENCE = /^\s*(`{3,}|~{3,})\s*(.*)$/;

function openFenceAt(lineAt: (index: number) => string, line: number): { lang: string } | undefined {
  let open: { fence: string; lang: string } | undefined;
  for (let i = 0; i < line; i++) {
    const match = lineAt(i).match(FENCE);
    if (!match) {
      continue;
    }
    const [, fence, rest] = match;
    if (!open) {
      const lang = rest.match(/^\{?\s*\.?([A-Za-z0-9_+-]+)/)?.[1]?.toLowerCase() ?? "";
      open = { fence, lang };
    } else if (rest.trim() === "" && fence[0] === open.fence[0] && fence.length >= open.fence.length) {
      open = undefined;
    }
  }
  return open ? { lang: open.lang } : undefined;
}

export function quartoChunkLanguage(
  lineAt: (index: number) => string,
  line: number
): string | undefined {
  const open = openFenceAt(lineAt, line);
  return open ? CHUNK_LANGUAGES[open.lang] : undefined;
}

export function inQuartoFrontMatter(
  lineAt: (index: number) => string,
  lineCount: number,
  line: number
): boolean {
  if (lineCount === 0 || !/^﻿?---[ \t]*$/.test(lineAt(0))) {
    return false;
  }
  for (let i = 1; i < lineCount; i++) {
    if (/^(---|\.\.\.)[ \t]*$/.test(lineAt(i))) {
      return line <= i;
    }
  }
  return false;
}

export function inQuartoFence(lineAt: (index: number) => string, line: number): boolean {
  return openFenceAt(lineAt, line) !== undefined;
}
