// src/features/templateService.ts

import * as vscode from 'vscode';

type TemplateValue = string | string[];

let outputChannel: vscode.OutputChannel | undefined;
function log(msg: string) {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Sci2Code');
    }
    outputChannel.appendLine(msg);
}

function getZoteroCreators(item: any): string {
    if (!item.data.creators || item.data.creators.length === 0) {
        return 'N/A';
    }
    return item.data.creators.map((c: any) => `${c.firstName} ${c.lastName}`).join(', ');
}

function normalizeTemplate(value: TemplateValue | undefined): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join('\n');
    return undefined;
}

/**
 * Case-insensitive property lookup. Returns the first property whose lowercase
 * name matches `key`. Zotero returns some fields with specific casing
 * (e.g. `DOI`, `ISBN`), so user templates like `${zotero.doi}` should still work.
 */
function lookupInsensitive(obj: Record<string, any>, key: string): any {
    if (key in obj) return obj[key];
    const lowered = key.toLowerCase();
    for (const k of Object.keys(obj)) {
        if (k.toLowerCase() === lowered) return obj[k];
    }
    return undefined;
}

export function renderTemplate(languageId: string, zoteroItem: any, codeMetadata: { codeId: string; functionName: string | null }): vscode.SnippetString {
    const config = vscode.workspace.getConfiguration('sci2code');
    const templates = config.get<Record<string, TemplateValue>>('templates', {});

    const template =
        normalizeTemplate(templates[languageId]) ??
        normalizeTemplate(templates['default']) ??
        `// Sci2Code: no template configured for "${languageId}". Edit \`sci2code.templates\` in settings.`;

    const zoteroAPIData = zoteroItem.data || {};
    const unknownKeys = new Set<string>();

    const rendered = template.replace(/\${(zotero|code)\.(\w+)}/g, (match, domain, key) => {
        if (domain === 'zotero') {
            if (key.toLowerCase() === 'creators') return getZoteroCreators(zoteroItem);
            if (key.toLowerCase() === 'url') return zoteroItem.links?.alternate?.href || 'N/A';
            if (key.toLowerCase() === 'key') return zoteroItem.key || 'N/A';

            const value = lookupInsensitive(zoteroAPIData, key);
            if (value !== undefined && value !== null && value !== '') {
                return String(value);
            }
            // Unknown/missing: only warn if the key truly isn't a Zotero field name.
            if (lookupInsensitive(zoteroAPIData, key) === undefined &&
                !['creators', 'url', 'key'].includes(key.toLowerCase())) {
                unknownKeys.add(`\${zotero.${key}}`);
            }
            return 'N/A';
        }
        if (domain === 'code') {
            if (key === 'id') return codeMetadata.codeId;
            if (key === 'functionName') return codeMetadata.functionName || 'N/A';
            unknownKeys.add(`\${code.${key}}`);
            return 'N/A';
        }
        return match;
    });

    if (unknownKeys.size > 0) {
        log(`[template] Unknown placeholder(s) in "${languageId}" template: ${Array.from(unknownKeys).join(', ')}. They were rendered as "N/A". See README for the list of supported placeholders.`);
    }

    return new vscode.SnippetString(rendered);
}
