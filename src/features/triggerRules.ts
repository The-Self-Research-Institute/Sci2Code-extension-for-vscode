export const STRUCTURAL_TRIGGERS = new Set(["<!--", "#", "#'", '"""', "'''", "/**", "/*", "//", "///"]);

export function triggersFor(
  languageId: string,
  globalTriggers: string[] | undefined,
  languageSpecific: Record<string, string[]> | undefined
): string[] {
  const merged = [...(globalTriggers ?? []), ...(languageSpecific?.[languageId] ?? [])];
  return merged.filter((t, i) => typeof t === "string" && t.length > 0 && merged.indexOf(t) === i);
}

export function isProseTrigger(trigger: string): boolean {
  return !STRUCTURAL_TRIGGERS.has(trigger);
}

export function proseTriggers(triggers: string[]): string[] {
  return triggers.filter(isProseTrigger);
}

const CLOSERS: Array<[string, string]> = [
  ["/**", "*/"],
  ["/*", "*/"],
  ["<!--", "-->"],
  ['"""', '"""'],
  ["'''", "'''"],
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["<", ">"],
];

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function suffixPattern(trigger: string): RegExp {
  for (const [open, close] of CLOSERS) {
    if (trigger.startsWith(open)) {
      return new RegExp(`^\\s*${escapeRegex(close)}\\s*`);
    }
  }
  return /^\s*/;
}

export interface TriggerMatch {
  trigger: string;
  start: number;
  end: number;
}

export function findTrigger(prefix: string, suffix: string, triggers: string[]): TriggerMatch | null {
  const longestFirst = [...triggers].sort((a, b) => b.length - a.length);
  for (const trigger of longestFirst) {
    const typed = prefix.match(new RegExp(`${escapeRegex(trigger)}\\s*$`));
    if (!typed) {
      continue;
    }
    const begin = prefix.length - typed[0].length;
    const repeated = trigger.split("").every((ch) => ch === trigger[0]);
    if (repeated && begin > 0 && prefix[begin - 1] === trigger[0]) {
      continue;
    }
    const closing = suffix.match(suffixPattern(trigger));
    return {
      trigger,
      start: begin,
      end: prefix.length + (closing ? closing[0].length : 0),
    };
  }
  return null;
}

export type CompletionPath = "function" | "reference" | "prose" | "none";

export function completionPath(
  languageId: string,
  trigger: string | null,
  functionName: string | null,
  inProse: boolean
): CompletionPath {
  if (!trigger) {
    return "none";
  }
  const proseFile = languageId === "quarto" || languageId === "typst";
  if (proseFile && inProse && isProseTrigger(trigger)) {
    return "prose";
  }
  if (functionName) {
    return "function";
  }
  return languageId === "quarto" && inProse && trigger === "<!--" ? "reference" : "none";
}
