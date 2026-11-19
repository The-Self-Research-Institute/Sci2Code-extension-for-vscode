// src/features/templateService.ts

import * as vscode from 'vscode';
import { renderTemplateText } from './snippetText';
import { quartoChunkLanguage } from '../utils/quartoChunk';

type TemplateValue = string | string[];

let outputChannel: vscode.OutputChannel | undefined;
function log(msg: string) {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Sci2Code');
    }
    outputChannel.appendLine(msg);
}

function normalizeTemplate(value: TemplateValue | undefined): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join('\n');
    return undefined;
}

/**
 * The language whose template/comment syntax fits at `position`. Inside a Quarto
 * code chunk that is the chunk's language (an HTML comment would be a syntax
 * error in an executable Python or R chunk); everywhere else it is the
 * document's own language.
 */
export function templateLanguageFor(document: vscode.TextDocument, position: vscode.Position): string {
    if (document.languageId === 'quarto') {
        return quartoChunkLanguage((i) => document.lineAt(i).text, position.line) ?? 'quarto';
    }
    return document.languageId;
}

export function renderTemplate(languageId: string, zoteroItem: any, codeMetadata: { codeId: string; functionName: string | null }): vscode.SnippetString {
    const config = vscode.workspace.getConfiguration('sci2code');
    const templates = config.get<Record<string, TemplateValue>>('templates', {});

    const template =
        normalizeTemplate(templates[languageId]) ??
        normalizeTemplate(templates['default']) ??
        `// Sci2Code: no template configured for "${languageId}". Edit \`sci2code.templates\` in settings.`;

    const { text, unknown } = renderTemplateText(template, zoteroItem, codeMetadata, languageId);

    if (unknown.length > 0) {
        log(`[template] Unknown placeholder(s) in "${languageId}" template: ${unknown.join(', ')}. They were rendered as "N/A". See README for the list of supported placeholders.`);
    }

    return new vscode.SnippetString(text);
}


export function renderTemplateAt(
    document: vscode.TextDocument,
    position: vscode.Position,
    zoteroItem: any,
    codeMetadata: { codeId: string; functionName: string | null }
): vscode.SnippetString {
    return renderTemplate(templateLanguageFor(document, position), zoteroItem, codeMetadata);
}
