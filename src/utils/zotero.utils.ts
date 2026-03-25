import * as vscode from "vscode";
import { fetchZoteroItem, updateZoteroTags } from "../zotero/api";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import { generateSha256 } from "./utils";

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

export function extractFunctionName(
  lineText: string,
  lang: "javascript" | "python" | "r" | "julia"
): string | null {
  let match = null;
  switch (lang) {
    case "javascript":
      match = lineText.match(/function\s+(\w+)\s*\(/);
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
    default:
  }
  return match;
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
    if (!zoteroItem.ok) throw new Error(zoteroItem.statusText);

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
    if (!addZoteroTag.ok) throw new Error(addZoteroTag.statusText);

    vscode.window.showInformationMessage(
      "Zotero | Successfully attached codeId to zotero."
    );
  } catch (err: any) {
    vscode.window.showInformationMessage(
      `Zotero | Failed to attach codeId to zotero. Please try again.`
    );
  }
}
