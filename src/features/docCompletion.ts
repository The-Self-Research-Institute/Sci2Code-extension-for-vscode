import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  extractFileName,
  extractFunctionName,
  generateCodeId,
  getZoteroItemTitle,
  formatCitationMetadata,
  getCitationDetail,
} from "../utils/zotero.utils";
import { renderTemplateAt } from "./templateService";
import { completionPath, findTrigger, triggersFor } from "./triggerRules";
import { citeCompletionItems } from "./citeCompletion";
import { proseLanguageAt } from "./citeInTextCommand";

export const ATTACH_CODE_ID_COMMAND = "sci2code.attachCodeId";

// ============================================================================
// UNIFIED TRIGGER PATTERN MANAGER
// ============================================================================

class TriggerPatternManager {
  private static instance: TriggerPatternManager;

  private constructor() { }

  public static getInstance(): TriggerPatternManager {
    if (!TriggerPatternManager.instance) {
      TriggerPatternManager.instance = new TriggerPatternManager();
    }
    return TriggerPatternManager.instance;
  }

  public updatePatterns() { }

  public triggersForDocument(document: vscode.TextDocument): string[] {
    const config = vscode.workspace.getConfiguration("sci2code");
    return triggersFor(
      document.languageId,
      config.get<string[]>("triggers", []),
      config.get<Record<string, string[]>>("languageSpecificTriggers", {})
    );
  }

  public findMatchingPattern(
    document: vscode.TextDocument,
    position: vscode.Position
  ): {
    pattern: { trigger: string };
    range: vscode.Range;
  } | null {
    const line = document.lineAt(position.line).text;
    const match = findTrigger(
      line.slice(0, position.character),
      line.slice(position.character),
      this.triggersForDocument(document)
    );
    if (!match) {
      return null;
    }
    return {
      pattern: { trigger: match.trigger },
      range: new vscode.Range(position.line, match.start, position.line, match.end),
    };
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
      for (const ch of trigger) {
        if (ch) triggerChars.add(ch);
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
    this.insertText = renderTemplateAt(document, position, zoteroItem, metadata);
    // Runs only when the user accepts this item, not while they browse the list.
    this.command = {
      command: ATTACH_CODE_ID_COMMAND,
      title: "Attach code id to Zotero",
      arguments: [zoteroItem, metadata],
    };
  }
}

class UnifiedDocCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private languageId: string) { }

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | undefined> {
    const match = triggerPatternManager.findMatchingPattern(document, position);
    if (!match) {
      return undefined;
    }

    const zoteroItems = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);
    if (!zoteroItems || zoteroItems.length === 0) {
      return undefined;
    }

    const nextLineIndex = position.line + 1;
    const nextLineText = nextLineIndex < document.lineCount ? document.lineAt(nextLineIndex).text : "";
    const functionName = nextLineText
      ? extractFunctionName(nextLineText, this.languageId as any)
      : null;

    const proseFile = this.languageId === "quarto" || this.languageId === "typst";
    const path = completionPath(
      this.languageId,
      match.pattern.trigger,
      functionName,
      proseFile && !!proseLanguageAt(document, position)
    );

    if (path === "function" && functionName) {
      const fileName = extractFileName(document.fileName);
      const codeId = generateCodeId(functionName, fileName);
      const metadata = { codeId, functionName };

      return zoteroItems
        .filter((item: any) => item.data.itemType !== 'note')
        .map((item: any) => new LanguageCompletionItem(document, position, item, metadata));
    }

    if (path === "reference") {
      const fileName = extractFileName(document.fileName);
      const metadata = { codeId: generateCodeId(fileName, fileName), functionName: "" };
      return zoteroItems
        .filter((item: any) => item.data.itemType !== 'note')
        .map((item: any) => new LanguageCompletionItem(document, position, item, metadata));
    }

    if (path === "prose") {
      return citeCompletionItems(match.range, document.getText(match.range), `${match.pattern.trigger} `, {
        line: match.range.start.line,
        start: match.range.start.character,
        end: match.range.end.character,
      });
    }

    return undefined;
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
