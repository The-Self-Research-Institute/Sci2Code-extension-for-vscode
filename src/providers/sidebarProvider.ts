import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import { getZoteroItemTitle } from "../utils/zotero.utils";

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
    const groupedItems: { [key: string]: SidebarItem[] } = {};

    // Group items by their itemType
    if (zoteroItems?.length > 0) {
      zoteroItems.forEach((zoteroItem: any) => {
        const itemType = zoteroItem.data?.itemType; // Optional chaining to safely access itemType
        const titleOrNote = getZoteroItemTitle(zoteroItem);

        // Ensure we handle missing itemType properly
        if (!itemType) {
          return; // Skip this item if it doesn't have a valid itemType
        }

        // Create a SidebarItem for the current zoteroItem
        const sidebarItem = new SidebarItem(
          `${titleOrNote} | ${zoteroItem?.links?.alternate?.href}`,
          vscode.TreeItemCollapsibleState.None
        );

        // Group by itemType
        if (!groupedItems[itemType]) {
          groupedItems[itemType] = []; // Initialize the array for this itemType
        }
        groupedItems[itemType].push(sidebarItem); // Add the SidebarItem to the corresponding group
      });

      // Create main SidebarItems for each itemType
      const combinedItems: SidebarItem[] = [];
      for (const [type, items] of Object.entries(groupedItems)) {
        const groupLabel = type.charAt(0).toUpperCase() + type.slice(1); // Capitalize itemType for display
        const groupItem = new SidebarItem(
          groupLabel,
          vscode.TreeItemCollapsibleState.Collapsed
        );
        combinedItems.push(groupItem); // Add group label item

        // Add the individual items to the combined items
        combinedItems.push(...items);
      }

      return combinedItems;
    }

    return [];
  }
}

export class SidebarItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command // Can be included or omitted as needed
  ) {
    super(label, collapsibleState);
  }
}
