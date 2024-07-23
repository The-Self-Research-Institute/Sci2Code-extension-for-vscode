import { setContext } from "../system/command";

export interface IContextService {
  readonly viewContext: { [key: string]: unknown };
  isLoggedIn: boolean;
  setContext(key: string, value: unknown): Promise<void>;
}

export class ContextService implements IContextService {
  readonly viewContext: { [key: string]: unknown };

  constructor() {
    this.viewContext = {};
  }

  async setContext(key: string, value: unknown): Promise<void> {
    this.viewContext[key] = value;
    await setContext(key, value);
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
