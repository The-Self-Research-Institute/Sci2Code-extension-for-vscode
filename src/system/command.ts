import * as vscode from 'vscode';
import { ZOTERO_CONTEXT_PREFIX } from './constants';

export const setContext = async (key: string, value: unknown): Promise<void> => {
  await vscode.commands.executeCommand('setContext', `${ZOTERO_CONTEXT_PREFIX}${key}`, value);
};
