export function escapeSnippetText(text: string): string {
  return text.replace(/[\\$}]/g, "\\$&");
}

interface CreatorLike {
  firstName?: string;
  lastName?: string;
  name?: string;
}

export function creatorDisplayName(creator: CreatorLike): string {
  const full = [creator.firstName, creator.lastName].filter(Boolean).join(" ").trim();
  return full || (creator.name || "").trim();
}

export function creatorsText(creators: CreatorLike[] | undefined): string {
  const names = (creators || []).map(creatorDisplayName).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "N/A";
}

const BLOCK_STAR_LANGUAGES = new Set([
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
  "typst",
]);

export function commentSafe(languageId: string, value: string): string {
  let out = value.replace(/\s*\r?\n\s*/g, " ").trim();
  if (BLOCK_STAR_LANGUAGES.has(languageId)) {
    out = out.replace(/\*\//g, "* /");
  }
  if (languageId === "typst") {
    out = out.replace(/\/\*/g, "/ *");
  }
  if (languageId === "quarto") {
    out = out.replace(/-->/g, "-- >");
  }
  if (languageId === "python" || languageId === "julia") {
    out = out.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
  }
  if (languageId === "julia") {
    out = out.replace(/\$/g, "\\$");
  }
  return out;
}

export function doiMarkdownLink(doi: unknown): string | undefined {
  const url = doiLink(doi);
  if (!url) {
    return undefined;
  }
  const label = url.replace(/^https:\/\/doi\.org\//, "").replace(/([\\[\]])/g, "\\$1");
  const href = url.replace(/[()\s<>]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
  return `[${label}](${href})`;
}

const OPTIONAL_FIELDS = new Set(["doi", "doiurl", "url", "year", "date", "publicationtitle"]);
const SPECIAL_FIELDS = new Set(["creators", "url", "key", "year", "doiurl"]);

export function doiLink(doi: unknown): string | undefined {
  const bare = String(doi ?? "")
    .trim()
    .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  return bare ? `https://doi.org/${bare}` : undefined;
}

function lookupInsensitive(obj: Record<string, any>, key: string): any {
  if (key in obj) {
    return obj[key];
  }
  const lowered = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lowered) {
      return obj[k];
    }
  }
  return undefined;
}

export interface RenderMeta {
  codeId: string;
  functionName: string | null;
}

function resolveValue(item: any, meta: RenderMeta, domain: string, key: string): string | undefined {
  const lowered = key.toLowerCase();
  if (domain === "code") {
    if (key === "id") {
      return meta.codeId;
    }
    if (key === "functionName") {
      return meta.functionName || undefined;
    }
    return undefined;
  }
  if (lowered === "creators") {
    const text = creatorsText(item.data?.creators);
    return text === "N/A" ? undefined : text;
  }
  if (lowered === "url") {
    return item.links?.alternate?.href || undefined;
  }
  if (lowered === "key") {
    return item.key || undefined;
  }
  if (lowered === "year") {
    return String(item.data?.date || "").match(/\d{4}/)?.[0];
  }
  if (lowered === "doiurl") {
    return doiLink(item.data?.DOI);
  }
  const value = lookupInsensitive(item.data || {}, key);
  return value !== undefined && value !== null && value !== "" ? String(value) : undefined;
}

export function renderTemplateText(
  template: string,
  item: any,
  meta: RenderMeta,
  languageId: string
): { text: string; unknown: string[] } {
  const unknown = new Set<string>();
  const data = item.data || {};
  const out: string[] = [];

  for (const line of template.split("\n")) {
    let placeholders = 0;
    let missingOptional = 0;
    const rendered = line.replace(/\${(zotero|code)\.(\w+)}/g, (_match, domain: string, key: string) => {
      placeholders++;
      const value = resolveValue(item, meta, domain, key);
      if (value === undefined) {
        const known =
          domain === "code"
            ? key === "id" || key === "functionName"
            : SPECIAL_FIELDS.has(key.toLowerCase()) || lookupInsensitive(data, key) !== undefined;
        if (!known) {
          unknown.add(`\${${domain}.${key}}`);
        }
        if (domain === "zotero" && OPTIONAL_FIELDS.has(key.toLowerCase())) {
          missingOptional++;
        }
        return "N/A";
      }
      return escapeSnippetText(commentSafe(languageId, value));
    });
    if (placeholders > 0 && missingOptional === placeholders) {
      continue;
    }
    out.push(rendered);
  }

  return { text: out.join("\n"), unknown: Array.from(unknown) };
}
