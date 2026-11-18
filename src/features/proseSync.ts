import { BibEntry, describeCiteKey, stripTypstNonCode } from "./bibtex";

const CROSS_REF = /^(fig|tbl|sec|eq|lst|thm|lem|cor|prp|cnj|def|exm|exr|nte|wrn|imp|tip|cau)-/;
const KEY = /(?<![\p{L}\p{N}_.@])@([\p{L}\p{N}_](?:[\p{L}\p{N}_:.+/-]*[\p{L}\p{N}_])?)/gu;
const URL_TEXT = /https?:\/\/[^\s)>\]]+/g;
const SKIPPED_TYPES = ["note", "attachment", "annotation"];

function stripQuartoNonProse(text: string): string {
  return text
    .replace(/^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, "")
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/`[^`\n]*`/g, "");
}

export function proseCitationKeys(text: string, language: "quarto" | "typst"): string[] {
  const body = (language === "typst" ? stripTypstNonCode(text) : stripQuartoNonProse(text)).replace(URL_TEXT, "");
  const found: string[] = [];
  for (const match of body.matchAll(KEY)) {
    const key = match[1];
    if (language === "quarto" && CROSS_REF.test(key)) {
      continue;
    }
    if (!found.includes(key)) {
      found.push(key);
    }
  }
  return found;
}

export interface ProseResolution {
  present: string[];
  add: any[];
  ambiguous: string[];
  unknown: string[];
}

export function resolveProseKeys(keys: string[], entries: BibEntry[], library: any[]): ProseResolution {
  const have = new Set(entries.map((entry) => entry.key));
  const byProposedKey = new Map<string, any[]>();
  for (const item of library) {
    if (!item?.data || SKIPPED_TYPES.includes(item.data.itemType)) {
      continue;
    }
    const proposed = describeCiteKey(item, []).key;
    byProposedKey.set(proposed, [...(byProposedKey.get(proposed) ?? []), item]);
  }

  const result: ProseResolution = { present: [], add: [], ambiguous: [], unknown: [] };
  for (const key of keys) {
    if (have.has(key)) {
      result.present.push(key);
      continue;
    }
    const candidates = byProposedKey.get(key) ?? [];
    if (candidates.length === 1) {
      result.add.push(candidates[0]);
    } else if (candidates.length > 1) {
      result.ambiguous.push(key);
    } else {
      result.unknown.push(key);
    }
  }
  return result;
}

export function itemsForProseKeys(keys: string[], entries: BibEntry[], library: any[]): any[] {
  const wanted = new Set(keys);
  const usable = library.filter((item) => item?.data && !SKIPPED_TYPES.includes(item.data.itemType));
  const proposedCount = new Map<string, number>();
  for (const item of usable) {
    const key = describeCiteKey(item, []).key;
    proposedCount.set(key, (proposedCount.get(key) ?? 0) + 1);
  }
  const found: any[] = [];
  for (const item of usable) {
    const inFile = describeCiteKey(item, entries);
    const proposed = describeCiteKey(item, []).key;
    const byFile = inFile.inFile && wanted.has(inFile.key);
    const byProposal = wanted.has(proposed) && proposedCount.get(proposed) === 1;
    if ((byFile || byProposal) && !found.includes(item)) {
      found.push(item);
    }
  }
  return found;
}
