import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  getZoteroItemTitle,
  formatCitationMetadata,
  getCitationDetail
} from "../utils/zotero.utils";

type ZoteroItem = any;

/**
 * Represents an item in the sidebar. It can be a top-level group (like "Journal Article")
 * or a specific Zotero reference under that group.
 */
export class SidebarItem extends vscode.TreeItem {
  public children: SidebarItem[] | undefined;
  public zoteroItem?: ZoteroItem;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    children?: SidebarItem[],
    zoteroItem?: ZoteroItem
  ) {
    super(label, collapsibleState);
    this.children = children;
    this.zoteroItem = zoteroItem;

    // Set icons and commands for different item types
    if (zoteroItem) {
      this.iconPath = new vscode.ThemeIcon("file-text");
      this.contextValue = 'zoteroItem';
      // Command to insert citation when this item is clicked
      this.command = {
        command: "sci2code.insertCitationFromSidebar",
        title: "Insert Citation",
        arguments: [this.zoteroItem],
      };
    } else if (children) {
      this.iconPath = new vscode.ThemeIcon("folder");
    }
  }
}

export class SidebarProvider implements vscode.TreeDataProvider<SidebarItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SidebarItem | undefined | null | void> = new vscode.EventEmitter<SidebarItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Holds the current search term for filtering
  private searchTerm: string = '';

  getTreeItem(element: SidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarItem): Thenable<SidebarItem[]> {
    // If we are getting children of a specific element, return its children
    if (element) {
      return Promise.resolve(element.children || []);
    }

    // Otherwise, build the entire tree from the root
    return Promise.resolve(this.buildTree());
  }

  /**
   * Builds the entire tree structure from Zotero items, applying any active filters.
   */
  private buildTree(): SidebarItem[] {
    const zoteroItems = (contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) as ZoteroItem[]) || [];

    // Context-sensitive help: No items loaded
    if (zoteroItems.length === 0 && !this.searchTerm) {
      const infoItem = new SidebarItem("No Zotero items. Please log in or refresh.", vscode.TreeItemCollapsibleState.None);
      infoItem.iconPath = new vscode.ThemeIcon("info");
      return [infoItem];
    }

    // Apply search filter
    let filteredItems = zoteroItems;
    if (this.searchTerm) {
      const lowerCaseSearchTerm = this.searchTerm.toLowerCase();
      filteredItems = zoteroItems.filter(item => {
        const title = getZoteroItemTitle(item).toLowerCase();
        return title.includes(lowerCaseSearchTerm);
      });
    }

    // Context-sensitive help: Search returned nothing
    if (filteredItems.length === 0 && this.searchTerm) {
      const infoItem = new SidebarItem(`No results for "${this.searchTerm}"`, vscode.TreeItemCollapsibleState.None);
      infoItem.iconPath = new vscode.ThemeIcon("search-stop");
      return [infoItem];
    }

    // Group the filtered items by itemType
    const groupedItems = new Map<string, ZoteroItem[]>();
    for (const item of filteredItems) {
      const itemType = item.data?.itemType || "Uncategorized";
      if (!groupedItems.has(itemType)) {
        groupedItems.set(itemType, []);
      }
      groupedItems.get(itemType)!.push(item);
    }

    // Convert the groups and their children into SidebarItems
    const tree: SidebarItem[] = [];
    for (const [itemType, items] of groupedItems.entries()) {
      const children = items.map(item => {
        const sidebarItem = new SidebarItem(
          getZoteroItemTitle(item),
          vscode.TreeItemCollapsibleState.None,
          undefined, // Leaf nodes have no children
          item       // Attach the full Zotero item
        );

        // Add tooltip with detailed citation info
        const metadata = formatCitationMetadata(item);
        const details = getCitationDetail(item);
        sidebarItem.tooltip = new vscode.MarkdownString(
          `**${getZoteroItemTitle(item)}**\n\n${metadata}${details ? '\n\n' + details : ''}`
        );

        // Add description (shown to the right of the label)
        sidebarItem.description = metadata;

        return sidebarItem;
      });

      const groupLabel = `${itemType} (${items.length})`;
      tree.push(new SidebarItem(
        groupLabel,
        vscode.TreeItemCollapsibleState.Expanded, // Groups start expanded
        children
      ));
    }
    return tree;
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Public method to trigger the search UI.
   */
  public async search(): Promise<void> {
    const result = await vscode.window.showInputBox({
      placeHolder: 'Search your Zotero library by title...',
      value: this.searchTerm,
    });

    if (result !== undefined) {
      this.searchTerm = result;
      this.refresh();
    }
  }

  /**
   * Public method to clear the search filter.
   */
  public clearFilter(): void {
    this.searchTerm = '';
    this.refresh();
  }
}