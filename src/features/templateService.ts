// src/features/templateService.ts

import * as vscode from 'vscode';

function getZoteroCreators(item: any): string {
    if (!item.data.creators || item.data.creators.length === 0) {
        return 'N/A';
    }
    return item.data.creators.map((c: any) => `${c.firstName} ${c.lastName}`).join(', ');
}

export function renderTemplate(languageId: string, zoteroItem: any, codeMetadata: { codeId: string; functionName: string | null }): vscode.SnippetString {
    const config = vscode.workspace.getConfiguration('sci2code');
    const templates = config.get<Record<string, string[]>>('templates', {});

    const templateLines = templates[languageId] || templates['default'] || ['Template not found for ${languageId}'];

    const template = templateLines.join('\n');
    
    const zoteroAPIData = zoteroItem.data || {};

    const rendered = template.replace(/\${(zotero|code)\.(\w+)}/g, (match, domain, key) => {
        if (domain === 'zotero') {
            if (key === 'creators') return getZoteroCreators(zoteroItem);
            if (key === 'url') return zoteroItem.links?.alternate?.href || 'N/A';
            return zoteroAPIData[key] || 'N/A';
        }
        if (domain === 'code') {
            if (key === 'id') return codeMetadata.codeId;
            if (key === 'functionName') return codeMetadata.functionName || 'N/A';
        }
        return match;
    });

    return new vscode.SnippetString(rendered);
}
