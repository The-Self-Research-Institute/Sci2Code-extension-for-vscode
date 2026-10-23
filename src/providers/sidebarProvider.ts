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

interface ZoteroCollectionNode {
  key: string;
  data: { name: string; parentCollection: string | false };
}

/** Sci2Code stores code metadata as JSON-valued tags; keep them out of the tag filter. */
function isUserTag(tag: string): boolean {
  return !tag.trim().startsWith("{");
}

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
  private collectionFilter?: { key: string; name: string };
  private tagFilter?: string;
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

  private getCollections(): ZoteroCollectionNode[] {
    return (
      (contextService.getContext(
        ZOTERO_CONTEXT.ZOTERO_COLLECTIONS
      ) as ZoteroCollectionNode[]) || []
    );
  }

  /** A collection's key plus the keys of all its nested subcollections. */
  private collectionAndDescendants(key: string): Set<string> {
    const all = this.getCollections();
    const keys = new Set<string>([key]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of all) {
        const parent = c.data.parentCollection;
        if (parent && keys.has(parent) && !keys.has(c.key)) {
          keys.add(c.key);
          grew = true;
        }
      }
    }
    return keys;
  }

  private matchesFilters(item: ZoteroItem): boolean {
    if (this.collectionFilter) {
      const wanted = this.collectionAndDescendants(this.collectionFilter.key);
      const inCollections: string[] = item.data?.collections || [];
      if (!inCollections.some((k) => wanted.has(k))) return false;
    }
    if (this.tagFilter) {
      const tags: Array<{ tag: string }> = item.data?.tags || [];
      if (!tags.some((t) => t.tag === this.tagFilter)) return false;
    }
    return true;
  }

  private hasActiveFilter(): boolean {
    return (
      this.searchTerm !== "" ||
      this.collectionFilter !== undefined ||
      this.tagFilter !== undefined
    );
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

    if (zoteroItems.length === 0 && !this.hasActiveFilter()) {
      const infoItem = new SidebarItem(
        "No Zotero items. Please log in or refresh.",
        vscode.TreeItemCollapsibleState.None
      );
      infoItem.iconPath = new vscode.ThemeIcon("info");
      return [infoItem];
    }

    const filteredItems = zoteroItems.filter(
      (i) => this.matchesFilters(i) && this.matchesSearch(i, this.searchTerm)
    );

    this.updateViewDescription(filteredItems.length, zoteroItems.length);

    if (filteredItems.length === 0 && this.hasActiveFilter()) {
      const infoItem = new SidebarItem(
        "No items match the current filters",
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
      const shouldExpand = this.hasActiveFilter() || items.length <= 20;
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
    const active: string[] = [];
    if (this.collectionFilter) active.push(`collection: ${this.collectionFilter.name}`);
    if (this.tagFilter) active.push(`tag: ${this.tagFilter}`);
    if (this.searchTerm) active.push(`"${this.searchTerm}"`);
    if (active.length > 0) {
      this.treeView.description = `${active.join(", ")} \u00b7 ${shown}/${total}`;
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
      this.syncFilterContext();
      this.refresh();
    }
  }

  public clearFilter(): void {
    this.searchTerm = "";
    this.collectionFilter = undefined;
    this.tagFilter = undefined;
    this.syncFilterContext();
    this.refresh();
  }

  private syncFilterContext(): void {
    vscode.commands.executeCommand(
      "setContext",
      "zotero:hasFilter",
      this.hasActiveFilter()
    );
  }

  public async filterBy(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      [
        { label: "$(folder) Collection", value: "collection" as const },
        { label: "$(tag) Tag", value: "tag" as const },
      ],
      { placeHolder: "Filter Zotero documents by..." }
    );
    if (!picked) return;
    if (picked.value === "collection") {
      await this.chooseCollection();
    } else {
      await this.chooseTag();
    }
  }

  private async chooseCollection(): Promise<void> {
    const collections = this.getCollections();
    if (collections.length === 0) {
      vscode.window.showInformationMessage(
        "Sci2Code: No Zotero collections found. Try refreshing the library."
      );
      return;
    }
    const byKey = new Map(collections.map((c) => [c.key, c]));
    const pathOf = (c: ZoteroCollectionNode): string => {
      const names = [c.data.name];
      const seen = new Set<string>([c.key]);
      let parent = c.data.parentCollection;
      while (parent && byKey.has(parent) && !seen.has(parent)) {
        seen.add(parent);
        names.unshift(byKey.get(parent)!.data.name);
        parent = byKey.get(parent)!.data.parentCollection;
      }
      return names.join(" / ");
    };
    const picks = collections
      .map((c) => ({ label: pathOf(c), key: c.key, name: c.data.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const picked = await vscode.window.showQuickPick(picks, {
      placeHolder: "Show items in collection (includes subcollections)",
    });
    if (!picked) return;
    this.collectionFilter = { key: picked.key, name: picked.name };
    this.syncFilterContext();
    this.refresh();
  }

  private async chooseTag(): Promise<void> {
    const items =
      (contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) as ZoteroItem[]) ||
      [];
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const t of item.data?.tags || []) {
        if (t?.tag && isUserTag(t.tag)) {
          counts.set(t.tag, (counts.get(t.tag) || 0) + 1);
        }
      }
    }
    if (counts.size === 0) {
      vscode.window.showInformationMessage(
        "Sci2Code: No tags found in your Zotero library."
      );
      return;
    }
    const picks = Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([tag, n]) => ({ label: tag, description: `${n}` }));
    const picked = await vscode.window.showQuickPick(picks, {
      placeHolder: "Show items with tag",
    });
    if (!picked) return;
    this.tagFilter = picked.label;
    this.syncFilterContext();
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
