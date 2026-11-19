import * as vscode from "vscode";
import { fetchZoteroItem, updateZoteroTags } from "../zotero/api";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import { generateSha256 } from "./utils";
import { findFunctionNameFrom } from "./functionName";

export function getZoteroItemTitle(zoteroItem: any): string {
  if (zoteroItem?.data) {
    const itemType = zoteroItem.data.itemType;
    let rawText;

    if (itemType === "note") {
      rawText = zoteroItem.data.note;
    } else if (itemType === "annotation") {
      rawText = zoteroItem.data.annotationText || "Untitled Annotation";
    } else {
      // Clean title without concatenating other fields
      rawText = zoteroItem.data.title || "Untitled Article";
    }

    const plainText =
      rawText.replace(/<\/?[^>]+(>|$)/g, "").trim() || "Untitled";

    return limitCharacters(plainText, 100);
  }
  return "Unknown Item";
}

/**
 * Formats authors for display
 */
export function formatZoteroAuthors(zoteroItem: any): string {
  if (!zoteroItem?.data?.creators || zoteroItem.data.creators.length === 0) {
    return "Unknown Authors";
  }

  const creators = zoteroItem.data.creators;
  if (creators.length === 1) {
    const author = creators[0];
    return `${author.lastName || author.name || "Unknown"}`;
  } else if (creators.length === 2) {
    return `${creators[0].lastName || creators[0].name} & ${creators[1].lastName || creators[1].name}`;
  } else {
    return `${creators[0].lastName || creators[0].name} et al.`;
  }
}

/**
 * Formats complete citation metadata for display
 */
export function formatCitationMetadata(zoteroItem: any): string {
  const parts: string[] = [];

  const authors = formatZoteroAuthors(zoteroItem);
  parts.push(authors);

  if (zoteroItem.data.date) {
    const year = zoteroItem.data.date.match(/\d{4}/)?.[0] || zoteroItem.data.date;
    parts.push(year);
  }

  if (zoteroItem.data.publicationTitle) {
    parts.push(zoteroItem.data.publicationTitle);
  }

  return parts.join(" • ");
}

/**
 * Gets detailed information for citation preview
 */
export function getCitationDetail(zoteroItem: any): string {
  const details: string[] = [];

  if (zoteroItem.data.DOI) {
    details.push(`DOI: ${zoteroItem.data.DOI}`);
  }

  if (zoteroItem.data.volume) {
    details.push(`Vol. ${zoteroItem.data.volume}`);
  }

  if (zoteroItem.data.issue) {
    details.push(`Issue ${zoteroItem.data.issue}`);
  }

  if (zoteroItem.data.pages) {
    details.push(`pp. ${zoteroItem.data.pages}`);
  }

  if (details.length > 0) {
    return details.join(" | ");
  }

  return zoteroItem.links?.alternate?.href || "";
}

function limitCharacters(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.substring(0, maxChars) + "...";
}

export { extractFunctionName, functionLanguage } from "./functionName";

/** First function defined at or after `fromLine`, for the document's language. */
export function findFunctionNameFromLine(
  document: vscode.TextDocument,
  fromLine: number
): string | null {
  return findFunctionNameFrom(
    { count: document.lineCount, at: (i) => document.lineAt(i).text },
    document.languageId,
    fromLine
  );
}

export function extractFileName(fullPath: string): string {
  return fullPath.split(/[/\\]/).pop() || "";
}

function generateUniqueString(): string {
  const uuid = crypto.randomUUID();
  const date = Date.now();
  return `${uuid.slice(0, 4)}${date.toString().slice(0, 4)}`;
}

export function generateCodeId(functionName: string, fileName: string): string {
  const uniqueString = generateUniqueString();
  const uniqueFunctionName = `${functionName}____${uniqueString}`;
  const functionNameAbbreviation = generateSha256(uniqueFunctionName);
  const fileNameAbbreviation = generateSha256(fileName);
  return `${functionNameAbbreviation.slice(0, 4)}${fileNameAbbreviation.slice(
    0,
    4
  )}`;
}

export async function saveMetadataToZotero(
  userId: string,
  itemKey: string,
  metadata: { codeId: string; functionName: string | null }
): Promise<void> {
  try {
    const session = await vscode.authentication.getSession(
      ZoteroAuthenticationProvider.id,
      []
    );
    const apiKey = session?.accessToken;

    if (!apiKey) {
      throw new Error(
        "Zotero | Invalid Session. Please sign out and try again."
      );
    }

    const zoteroItem = await fetchZoteroItem(userId, itemKey, apiKey);
    if (!zoteroItem.ok) throw new Error(`reading the item failed (${zoteroItem.status} ${zoteroItem.statusText})`);

    const zoteroItemRes: any = await zoteroItem.json();
    const version = zoteroItemRes.version;
    const tags = zoteroItemRes?.data?.tags || [];
    const updatedTags = [...tags, { tag: JSON.stringify(metadata) }];

    const addZoteroTag = await updateZoteroTags(
      userId,
      itemKey,
      apiKey,
      version,
      updatedTags
    );
    if (!addZoteroTag.ok) {
      const hint =
        addZoteroTag.status === 403
          ? "your API key is read-only. Create a key with write access at zotero.org/settings/keys"
          : addZoteroTag.status === 412
            ? "the item changed in Zotero while saving"
            : addZoteroTag.status === 404
              ? "the item was not found (group libraries are not supported for this step)"
              : `${addZoteroTag.status} ${addZoteroTag.statusText}`;
      throw new Error(hint);
    }

    vscode.window.showInformationMessage(
      "Zotero | Successfully attached codeId to zotero."
    );
  } catch (err: any) {
    console.error("[Sci2Code] Failed to attach codeId to Zotero:", err);
    vscode.window.showWarningMessage(
      `Zotero | Failed to attach codeId to Zotero: ${err?.message ?? "unknown error"}.`
    );
  }
}

/**
 * Saves the code id as a tag on the Zotero item. Skipped for items that cannot
 * be updated through the personal-library endpoint: group-library items and
 * manual citations that never reached Zotero.
 */
export function attachCodeIdToItem(
  zoteroItem: any,
  metadata: { codeId: string; functionName: string | null }
): Promise<void> | undefined {
  const userId = zoteroItem?.library?.id;
  const itemKey = zoteroItem?.key;
  if (!userId || !itemKey || zoteroItem.library?.type === "group" || /^MANUAL_/.test(itemKey)) {
    return undefined;
  }
  return saveMetadataToZotero(String(userId), itemKey, metadata);
}
