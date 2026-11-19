import { BibEntry, BibSyncPlan, describeCiteKey } from "./bibtex";

export type ProseLanguage = "quarto" | "typst";

export function isCitationTrigger(beforeAt: string): boolean {
  return beforeAt === "" || /[\s[;(,{]$/.test(beforeAt);
}

export function proseCitation(language: ProseLanguage, key: string, before: string): string {
  const spaced = /[A-Za-z0-9]$/.test(before) ? " " : "";
  if (language === "typst") {
    return `${spaced}@${key}`;
  }
  const open = before.lastIndexOf("[");
  const close = before.lastIndexOf("]");
  if (open > close) {
    const tail = before.slice(open + 1).trimEnd();
    const gap = /\s$/.test(before) ? "" : " ";
    if (tail === "") {
      return `@${key}`;
    }
    if (tail.endsWith(";")) {
      return `${gap}@${key}`;
    }
    if (/@[^\s;\]]+$/.test(tail)) {
      return `; @${key}`;
    }
    return `${gap}@${key}`;
  }
  return `${spaced}[@${key}]`;
}

export interface CiteContext {
  language: ProseLanguage;
  before: string;
}

export interface CitePorts<T> {
  declared(): Promise<T[]>;
  fallback(): T;
  entries(files: T[]): Promise<BibEntry[]>;
  choose(files: T[]): Promise<T | undefined>;
  confirmDeclaration(file: T): Promise<boolean>;
  append(target: T, others: T[]): Promise<BibSyncPlan>;
  unchanged(): boolean;
  apply(citation: string, declare: T | undefined): Promise<boolean>;
}

export type CiteOutcome =
  | { status: "cited"; key: string; saved: boolean }
  | { status: "cancelled" }
  | { status: "invalid" }
  | { status: "write-failed"; message: string }
  | { status: "document-changed"; key: string }
  | { status: "not-inserted"; key: string };

export async function citeInText<T>(
  item: any,
  context: CiteContext,
  ports: CitePorts<T>
): Promise<CiteOutcome> {
  const declared = await ports.declared();
  const known = await ports.entries(declared);
  const existing = describeCiteKey(item, known);

  let key: string;
  let declare: T | undefined;
  let saved = false;

  if (declared.length > 0 && existing.inFile) {
    key = existing.key;
  } else {
    let target: T;
    if (declared.length === 0) {
      target = ports.fallback();
      if (!(await ports.confirmDeclaration(target))) {
        return { status: "cancelled" };
      }
      declare = target;
    } else if (declared.length === 1) {
      target = declared[0];
    } else {
      const chosen = await ports.choose(declared);
      if (chosen === undefined) {
        return { status: "cancelled" };
      }
      target = chosen;
    }

    let plan: BibSyncPlan;
    try {
      plan = await ports.append(
        target,
        declared.filter((file) => file !== target)
      );
    } catch (e) {
      return { status: "write-failed", message: e instanceof Error ? e.message : String(e) };
    }
    if (plan.invalid.length > 0) {
      return { status: "invalid" };
    }
    const match = plan.added[0] ?? plan.existing[0];
    if (!match) {
      return { status: "write-failed", message: "The bibliography entry could not be confirmed." };
    }
    key = match.bibKey;
    saved = plan.added.length > 0;
  }

  if (!ports.unchanged()) {
    return { status: "document-changed", key };
  }
  const inserted = await ports.apply(proseCitation(context.language, key, context.before), declare);
  return inserted ? { status: "cited", key, saved } : { status: "not-inserted", key };
}
