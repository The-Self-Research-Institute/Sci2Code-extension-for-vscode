import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  extractFileName,
  extractFunctionName,
  generateCodeId,
  getZoteroItemTitle,
  saveMetadataToZotero,
  formatCitationMetadata,
  getCitationDetail,
} from "../utils/zotero.utils";
import { renderTemplate } from "./templateService";

// ============================================================================
// UNIFIED TRIGGER PATTERN MANAGER
// ============================================================================

interface TriggerPattern {
  trigger: string;
  prefixRegex: RegExp;
  suffixRegex: RegExp;
}

class TriggerPatternManager {
  private patterns: TriggerPattern[] = [];
  private static instance: TriggerPatternManager;

  private constructor() {
    this.updatePatterns();

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("sci2code.triggers") ||
        e.affectsConfiguration("sci2code.languageSpecificTriggers")
      ) {
        this.updatePatterns();
      }
    });
  }

  public static getInstance(): TriggerPatternManager {
    if (!TriggerPatternManager.instance) {
      TriggerPatternManager.instance = new TriggerPatternManager();
    }
    return TriggerPatternManager.instance;
  }

  public updatePatterns() {
    const config = vscode.workspace.getConfiguration("sci2code");
    const globalTriggers = config.get<string[]>("triggers", []);
    const langConfig = config.get<Record<string, string[]>>(
      "languageSpecificTriggers",
      {}
    );

    const allLanguageIds = new Set(Object.keys(langConfig));
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      allLanguageIds.add(activeEditor.document.languageId);
    }

    let allTriggers = new Set<string>(globalTriggers);
    Object.values(langConfig).forEach((triggers) => {
      triggers.forEach((trigger) => allTriggers.add(trigger));
    });

    this.patterns = Array.from(allTriggers).map((trigger) =>
      this.createPattern(trigger)
    );
  }

  private createPattern(trigger: string): TriggerPattern {
    const escapedTrigger = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefixRegex = new RegExp(`${escapedTrigger}\\s*$`);
    const suffixRegex = this.inferSuffixPattern(trigger);
    return { trigger, prefixRegex, suffixRegex };
  }

  private inferSuffixPattern(trigger: string): RegExp {
    const mappings: Record<string, string> = {
      "/**": "\\*\\/",
      "/*": "\\*\\/",
      '"""': '"""',
      "'''": "'''",
      "(": ")",
      "[": "]",
      "{": "}",
      "<": ">",
    };
    for (const key in mappings) {
      if (trigger.startsWith(key)) {
        return new RegExp(`^\\s*${mappings[key]}\\s*`);
      }
    }
    return /^\s*/;
  }

  public findMatchingPattern(
    document: vscode.TextDocument,
    position: vscode.Position
  ): {
    pattern: TriggerPattern;
    range: vscode.Range;
  } | null {
    const line = document.lineAt(position.line).text;
    const prefix = line.slice(0, position.character);
    const suffix = line.slice(position.character);

    const sortedPatterns = [...this.patterns].sort(
      (a, b) => b.trigger.length - a.trigger.length
    );

    for (const pattern of sortedPatterns) {
      const prefixMatch = prefix.match(pattern.prefixRegex);
      if (prefixMatch) {
        const suffixMatch = suffix.match(pattern.suffixRegex);
        const start = position.translate(0, -prefixMatch[0].length);
        const end = position.translate(
          0,
          suffixMatch ? suffixMatch[0].length : 0
        );
        const range = new vscode.Range(start, end);
        return { pattern, range };
      }
    }
    return null;
  }

  public getTriggersForLanguage(languageId: string): string[] {
    const config = vscode.workspace.getConfiguration("sci2code");
    const globalTriggers = config.get<string[]>("triggers", []);
    const langConfig = config.get<Record<string, string[]>>(
      "languageSpecificTriggers",
      {}
    );
    const langTriggers = langConfig[languageId] || [];

    const allTriggers = new Set([...globalTriggers, ...langTriggers]);
    const triggerChars = new Set<string>();
    allTriggers.forEach((trigger) => {
      if (trigger && trigger.length > 0) {
        triggerChars.add(trigger.charAt(trigger.length - 1));
      }
    });
    return Array.from(triggerChars);
  }
}

export const triggerPatternManager = TriggerPatternManager.getInstance();

// ============================================================================
// BASE COMPLETION ITEM AND PROVIDER
// ============================================================================

abstract class BaseDocCompletionItem extends vscode.CompletionItem {
  constructor(
    document: vscode.TextDocument,
    position: vscode.Position,
    public zoteroItem: any,
    public metadata: { codeId: string; functionName: string }
  ) {
    const titleOfItem = getZoteroItemTitle(zoteroItem);
    super(`Zotero: ${titleOfItem}`, vscode.CompletionItemKind.Snippet);

    // Use improved formatting for detail
    const citationInfo = formatCitationMetadata(zoteroItem);
    const details = getCitationDetail(zoteroItem);
    this.detail = citationInfo;
    this.documentation = new vscode.MarkdownString(
      `**${titleOfItem}**\n\n${citationInfo}\n\n${details ? details : ''}`
    );
    this.sortText = "0";

    const match = triggerPatternManager.findMatchingPattern(document, position);
    if (match) {
      this.range = match.range;
      this.filterText = `${match.pattern.trigger} ${titleOfItem}`;
    } else {
      this.range = new vscode.Range(position, position);
    }
  }
}

class LanguageCompletionItem extends BaseDocCompletionItem {
  constructor(
    document: vscode.TextDocument,
    position: vscode.Position,
    zoteroItem: any,
    metadata: { codeId: string; functionName: string }
  ) {
    super(document, position, zoteroItem, metadata);
    console.log(
      "Rendering template for",
      document.languageId,
      zoteroItem,
      metadata
    );
    this.insertText = renderTemplate(document.languageId, zoteroItem, metadata);
  }
}

class UnifiedDocCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private languageId: string) { }

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | undefined> {
    const match = triggerPatternManager.findMatchingPattern(document, position);
    console.log("Matching pattern:", match);
    if (!match) {
      return undefined;
    }

    const nextLineIndex = position.line + 1;
    console.log("Extracted next line index:", nextLineIndex, this.languageId);
    if (nextLineIndex >= document.lineCount) {
      return undefined;
    }

    const nextLineText = document.lineAt(nextLineIndex).text;
    const functionName = extractFunctionName(
      nextLineText,
      this.languageId as any
    );
    console.log("Extracted function name:", functionName);
    if (!functionName) {
      return undefined;
    }

    const zoteroItems = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);
    console.log("Extracted Zotero items:", zoteroItems);
    if (!zoteroItems || zoteroItems.length === 0) {
      return undefined;
    }

    const fileName = extractFileName(document.fileName);
    const codeId = generateCodeId(functionName, fileName);
    const metadata = { codeId, functionName };

    return zoteroItems
      .filter((item: any) => item.data.itemType !== 'note')
      .map((item: any) => new LanguageCompletionItem(document, position, item, metadata));
  }

  public resolveCompletionItem(
    item: BaseDocCompletionItem,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CompletionItem> {
    const userId = item?.zoteroItem?.library?.id;
    const itemKey = item?.zoteroItem?.key;
    if (userId && itemKey && item.metadata) {
      saveMetadataToZotero(userId, itemKey, item.metadata);
    }
    return item;
  }
}

export function registerCompletion(
  languageId: string,
  selector: vscode.DocumentSelector
): vscode.Disposable {
  console.log(languageId, "language id");
  const triggerChars = triggerPatternManager.getTriggersForLanguage(languageId);
  return vscode.languages.registerCompletionItemProvider(
    selector,
    new UnifiedDocCompletionProvider(languageId),
    ...triggerChars
  );
}
