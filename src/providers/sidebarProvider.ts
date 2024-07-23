import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";

export class SidebarProvider implements vscode.TreeDataProvider<SidebarItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    SidebarItem | undefined | void
  > = new vscode.EventEmitter<SidebarItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarItem | undefined | void> =
    this._onDidChangeTreeData.event;

  getTreeItem(element: SidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarItem): Thenable<SidebarItem[]> {
    return Promise.resolve(this.getSidebarItems());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  private getSidebarItems(): SidebarItem[] {
    const zoteroItems = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);

    if (zoteroItems?.length > 0) {
      const completionItems = zoteroItems?.map((zoteroItem: any) => {
        return new SidebarItem(
          `${zoteroItem?.data?.title} | ${zoteroItem?.links?.alternate?.href}`,
          vscode.TreeItemCollapsibleState.None,
          {
            command: ``,
            title: `${zoteroItem?.data?.title} | ${zoteroItem?.links?.alternate?.href}`,
          }
        );
      });

      return completionItems;
    }

    return [];
  }
}

export class SidebarItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
  }
}
