import * as vscode from "vscode";
import {
  LibrarySnapshot,
  parseSnapshot,
  serializeSnapshot,
} from "./cacheFormat";

const FILE_NAME = "library-cache.json";

class LibraryCache {
  private directory?: vscode.Uri;

  init(context: vscode.ExtensionContext): void {
    this.directory = context.globalStorageUri;
  }

  private get file(): vscode.Uri | undefined {
    return this.directory && vscode.Uri.joinPath(this.directory, FILE_NAME);
  }

  async load(): Promise<LibrarySnapshot | null> {
    const file = this.file;
    if (!file) {
      return null;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      return parseSnapshot(new TextDecoder("utf-8").decode(bytes));
    } catch {
      return null;
    }
  }

  async save(snapshot: Omit<LibrarySnapshot, "version">): Promise<void> {
    const file = this.file;
    if (!file || !this.directory) {
      return;
    }
    try {
      await vscode.workspace.fs.createDirectory(this.directory);
      const temp = vscode.Uri.joinPath(this.directory, `${FILE_NAME}.tmp`);
      await vscode.workspace.fs.writeFile(
        temp,
        new TextEncoder().encode(serializeSnapshot(snapshot))
      );
      await vscode.workspace.fs.rename(temp, file, { overwrite: true });
    } catch (e) {
      console.error("[Sci2Code] Failed to write library cache:", e);
    }
  }

  async clear(): Promise<void> {
    const file = this.file;
    if (!file) {
      return;
    }
    try {
      await vscode.workspace.fs.delete(file);
    } catch {
      return;
    }
  }
}

export const libraryCache = new LibraryCache();
