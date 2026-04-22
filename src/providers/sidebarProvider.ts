import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import {
  getZoteroItemTitle,
  formatZoteroAuthors,
  formatCitationMetadata,
  getCitationDetail,
} from "../utils/zotero.utils";

type ZoteroItem = any;
type SortMode = "type" | "title" | "date" | "author";

const ITEM_TYPE_LABELS: Record<string, string> = {
  journalArticle: "Journal Articles",
  book: "Books",
  bookSection: "Book Sections",
  conferencePaper: "Conference Papers",
  thesis: "Theses",
  manuscript: "Manuscripts",
  webpage: "Web Pages",
  report: "Reports",
  preprint: "Preprints",
  computerProgram: "Software",
  dataset: "Datasets",
  patent: "Patents",
  presentation: "Presentations",
  blogPost: "Blog Posts",
  magazineArticle: "Magazine Articles",
  newspaperArticle: "Newspaper Articles",
  encyclopediaArticle: "Encyclopedia Articles",
  document: "Documents",
  note: "Notes",
  attachment: "Attachments",
};

const ITEM_TYPE_ICONS: Record<string, string> = {
  journalArticle: "book",
  book: "library",
  bookSection: "book",
  conferencePaper: "organization",
  thesis: "mortar-board",
  manuscript: "file-text",
  webpage: "globe",
  report: "file",
  preprint: "file-code",
  computerProgram: "code",
  dataset: "database",
  patent: "law",
  presentation: "screen-full",
  blogPost: "edit",
  magazineArticle: "file-text",
  newspaperArticle: "newspaper",
  encyclopediaArticle: "book",
  document: "file",
  note: "note",
  attachment: "file-binary",
};

function humanizeItemType(itemType: string): string {
  return (
    ITEM_TYPE_LABELS[itemType] ||
    itemType
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim()
  );
}

function iconForItem(itemType: string): vscode.ThemeIcon {
  return new vscode.ThemeIcon(ITEM_TYPE_ICONS[itemType] || "file-text");
}

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

    if (zoteroItem) {
      const itemType = zoteroItem.data?.itemType || "document";
      this.iconPath = iconForItem(itemType);
      this.contextValue = "zoteroItem";
      this.command = {
        command: "sci2code.insertCitationFromSidebar",
        title: "Insert Citation",
        arguments: [this.zoteroItem],
      };
    } else if (children) {
      this.iconPath = new vscode.ThemeIcon("folder");
      this.contextValue = "zoteroGroup";
    }
  }
}

export class SidebarProvider implements vscode.TreeDataProvider<SidebarItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    SidebarItem | undefined | null | void
  > = new vscode.EventEmitter<SidebarItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    SidebarItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private searchTerm: string = "";
  private sortMode: SortMode = "type";
  public treeView?: vscode.TreeView<SidebarItem>;

  getTreeItem(element: SidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarItem): Thenable<SidebarItem[]> {
    if (element) {
      return Promise.resolve(element.children || []);
    }
    return Promise.resolve(this.buildTree());
  }

  private matchesSearch(item: ZoteroItem, term: string): boolean {
    if (!term) return true;
    const d = item.data || {};
    const haystack = [
      getZoteroItemTitle(item),
      formatZoteroAuthors(item),
      ...(d.creators || []).map(
        (c: any) => `${c.firstName || ""} ${c.lastName || c.name || ""}`
      ),
      d.DOI || "",
      d.date || "",
      d.publicationTitle || "",
      d.itemType || "",
      humanizeItemType(d.itemType || ""),
    ]
      .join(" \u0000 ")
      .toLowerCase();
    return haystack.includes(term.toLowerCase());
  }

  private sortItems(items: ZoteroItem[]): ZoteroItem[] {
    const sorted = [...items];
    switch (this.sortMode) {
      case "title":
        sorted.sort((a, b) =>
          getZoteroItemTitle(a).localeCompare(getZoteroItemTitle(b))
        );
        break;
      case "author":
        sorted.sort((a, b) =>
          formatZoteroAuthors(a).localeCompare(formatZoteroAuthors(b))
        );
        break;
      case "date":
        sorted.sort((a, b) => {
          const ya = parseInt(
            (a.data?.date || "").match(/\d{4}/)?.[0] || "0",
            10
          );
          const yb = parseInt(
            (b.data?.date || "").match(/\d{4}/)?.[0] || "0",
            10
          );
          return yb - ya;
        });
        break;
      case "type":
      default:
        break;
    }
    return sorted;
  }

  private buildTree(): SidebarItem[] {
    const zoteroItems =
      (contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) as ZoteroItem[]) ||
      [];

    if (zoteroItems.length === 0 && !this.searchTerm) {
      const infoItem = new SidebarItem(
        "No Zotero items. Please log in or refresh.",
        vscode.TreeItemCollapsibleState.None
      );
      infoItem.iconPath = new vscode.ThemeIcon("info");
      return [infoItem];
    }

    const filteredItems = zoteroItems.filter((i) =>
      this.matchesSearch(i, this.searchTerm)
    );

    this.updateViewDescription(filteredItems.length, zoteroItems.length);

    if (filteredItems.length === 0 && this.searchTerm) {
      const infoItem = new SidebarItem(
        `No results for "${this.searchTerm}"`,
        vscode.TreeItemCollapsibleState.None
      );
      infoItem.iconPath = new vscode.ThemeIcon("search-stop");
      return [infoItem];
    }

    if (this.sortMode !== "type") {
      return this.sortItems(filteredItems).map((i) => this.leafItem(i));
    }

    const grouped = new Map<string, ZoteroItem[]>();
    for (const item of filteredItems) {
      const t = item.data?.itemType || "document";
      if (!grouped.has(t)) grouped.set(t, []);
      grouped.get(t)!.push(item);
    }

    const tree: SidebarItem[] = [];
    const orderedTypes = Array.from(grouped.keys()).sort((a, b) =>
      humanizeItemType(a).localeCompare(humanizeItemType(b))
    );

    for (const itemType of orderedTypes) {
      const items = grouped.get(itemType)!;
      const children = this.sortItems(items).map((i) => this.leafItem(i));
      const label = `${humanizeItemType(itemType)} (${items.length})`;
      const shouldExpand = this.searchTerm !== "" || items.length <= 20;
      const node = new SidebarItem(
        label,
        shouldExpand
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
        children
      );
      node.iconPath = iconForItem(itemType);
      tree.push(node);
    }
    return tree;
  }

  private leafItem(item: ZoteroItem): SidebarItem {
    const title = getZoteroItemTitle(item);
    const sidebarItem = new SidebarItem(
      title,
      vscode.TreeItemCollapsibleState.None,
      undefined,
      item
    );

    const metadata = formatCitationMetadata(item);
    const details = getCitationDetail(item);

    sidebarItem.tooltip = new vscode.MarkdownString(
      `**${title}**\n\n${metadata}${details ? "\n\n" + details : ""}\n\n_Click to insert \u00b7 Right-click for more actions_`
    );

    const year = (item.data?.date || "").match(/\d{4}/)?.[0] || "";
    const authors = formatZoteroAuthors(item);
    sidebarItem.description = year ? `${authors} \u00b7 ${year}` : authors;

    sidebarItem.id = `zotero-${item.key}`;

    return sidebarItem;
  }

  private updateViewDescription(shown: number, total: number): void {
    if (!this.treeView) return;
    if (this.searchTerm) {
      this.treeView.description = `filter: "${this.searchTerm}" \u00b7 ${shown}/${total}`;
    } else if (this.sortMode !== "type") {
      this.treeView.description = `sorted by ${this.sortMode} \u00b7 ${total}`;
    } else {
      this.treeView.description = total ? `${total} items` : undefined;
    }
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public async search(): Promise<void> {
    const result = await vscode.window.showInputBox({
      placeHolder: "Search by title, author, DOI, year, or journal",
      prompt: "Sci2Code: filter your Zotero library",
      value: this.searchTerm,
    });

    if (result !== undefined) {
      this.searchTerm = result;
      vscode.commands.executeCommand(
        "setContext",
        "zotero:hasFilter",
        this.searchTerm !== ""
      );
      this.refresh();
    }
  }

  public clearFilter(): void {
    this.searchTerm = "";
    vscode.commands.executeCommand("setContext", "zotero:hasFilter", false);
    this.refresh();
  }

  public async chooseSort(): Promise<void> {
    const picks: Array<vscode.QuickPickItem & { value: SortMode }> = [
      {
        label: "$(symbol-structure) Group by type",
        description: "default",
        value: "type",
      },
      { label: "$(symbol-string) Title (A \u2192 Z)", value: "title" },
      { label: "$(person) Author (A \u2192 Z)", value: "author" },
      { label: "$(calendar) Date (newest first)", value: "date" },
    ];
    const picked = await vscode.window.showQuickPick(picks, {
      placeHolder: "Sort Zotero Documents",
    });
    if (picked) {
      this.sortMode = picked.value;
      this.refresh();
    }
  }

  public getSearchTerm(): string {
    return this.searchTerm;
  }
}
