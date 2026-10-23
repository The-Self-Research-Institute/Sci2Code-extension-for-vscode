import * as vscode from "vscode";
import { setContext } from "../system/command";
import { ZOTERO_CONTEXT } from "../system/constants";

const LOCAL_ONLY_KEYS = new Set<string>([
  ZOTERO_CONTEXT.ZOTERO_ITEMS,
  ZOTERO_CONTEXT.ZOTERO_COLLECTIONS,
  ZOTERO_CONTEXT.LOAD_PROGRESS,
]);

export interface IContextService {
  readonly viewContext: { [key: string]: unknown };
  isLoggedIn: boolean;
  setContext(key: string, value: unknown): Promise<void>;
}

export class ContextService implements IContextService {
  readonly viewContext: { [key: string]: unknown };

  private readonly changeEmitter = new vscode.EventEmitter<string>();
  readonly onDidChange = this.changeEmitter.event;

  constructor() {
    this.viewContext = {};
  }

  async setContext(key: string, value: unknown): Promise<void> {
    this.viewContext[key] = value;
    if (!LOCAL_ONLY_KEYS.has(key)) {
      await setContext(key, value);
    }
    this.changeEmitter.fire(key);
  }

  getContext(key: string): any {
    const zoteroItem = this.viewContext[key];
    return zoteroItem;
  }

  get isLoggedIn(): boolean {
    return this.isLoggedIn;
  }
}

export const contextService = new ContextService();
