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
      rawText = zoteroItem.data.title
        ? `${zoteroItem.data.title} ${
            zoteroItem?.data?.DOI ? `| ${zoteroItem?.data?.DOI}` : ""
          } ${zoteroItem?.data?.ISBN ? `| ${zoteroItem?.data?.ISBN}` : ""} ${
            zoteroItem?.data?.ISSN ? `| ${zoteroItem?.data?.ISSN}` : ""
          }`
        : "Untitled Article";
    }

    const plainText =
      rawText.replace(/<\/?[^>]+(>|$)/g, "").trim() || "Untitled";

    return limitCharacters(plainText, 75);
  }
  return "Unknown Item";
}

function limitCharacters(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.substring(0, maxChars) + "...";
}

export function extractFunctionName(
  lineText: string,
  lang: "js" | "python" | "r" | "julia"
): string | null {
  let match = null;
  switch (lang) {
    case "js":
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
  metadata: { codeId: string; functionName: string }
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
