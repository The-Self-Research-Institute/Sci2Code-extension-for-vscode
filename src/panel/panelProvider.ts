import * as vscode from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import { insertCitationFromSidebarCommand } from "../features/insertCitationCommand";
import { renderTemplate } from "../features/templateService";
import { createManualItemInZotero } from "../features/insertCitationCommand";
import { ZoteroAuthenticationProvider } from "../providers/authProvider";
import { searchZoteroItems } from "../zotero/api";
import { getPanelHtml } from "./panelHtml";
import {
  DEFAULT_FILTERS,
  Filters,
  PanelItem,
  SortMode,
  Tab,
  allTags,
  collectionOptions,
  UnresolvedCitation,
  extractCitedKeys,
  filterItems,
  findUnresolvedCitations,
  PAGE_SIZE,
  paginate,
  searchText,
  toPanelItems,
  unresolvedAsItems,
} from "./libraryModel";

export const PANEL_VIEW_ID = "sci2code.panel";

const FEEDBACK_MS = 6000;
const SERVER_SEARCH_DELAY_MS = 400;
const SERVER_SEARCH_MIN_CHARS = 2;
const SORT_MODES: SortMode[] = ["title", "author", "year", "type"];
const TABS: Tab[] = ["library", "cited"];

const FORMAT_LABELS: Record<string, string> = {
  python: "Docstring",
  javascript: "JSDoc",
  javascriptreact: "JSDoc",
  typescript: "JSDoc",
  typescriptreact: "JSDoc",
  r: "R",
  julia: "Julia",
};

interface Feedback {
  text: string;
  warn: boolean;
}

export class PanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private filters: Filters = { ...DEFAULT_FILTERS };
  private selectedKey = "";
  private detailsKey = "";
  private showOptions = false;
  private page = 0;
  private searchSeq = 0;
  private searchTimer?: NodeJS.Timeout;
  private searching = false;
  private searchNote = "";
  private serverKeys = new Set<string>();
  private serverTerm = "";
  private extraRaw = new Map<string, any>();
  private feedback: Feedback = { text: "", warn: false };
  private feedbackTimer?: NodeJS.Timeout;
  private citedKeys = new Set<string>();
  private unresolved: UnresolvedCitation[] = [];
  private citedTimer?: NodeJS.Timeout;
  private cachedRaw: any[] | undefined;
  private rawByKey = new Map<string, any>();
  private items: PanelItem[] = [];
  private searchIndex = new Map<string, string>();
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    const saved = context.workspaceState.get<Partial<Filters>>("sci2code.panelFilters");
    if (saved) {
      this.filters = this.sanitize(saved);
    }

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.recomputeCited(0)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          this.recomputeCited(300);
        }
      })
    );
  }

  dispose(): void {
    clearTimeout(this.citedTimer);
    clearTimeout(this.feedbackTimer);
    clearTimeout(this.searchTimer);
    this.disposables.forEach((d) => d.dispose());
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "resources", "panel")],
    };
    const nonce = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join("");
    view.webview.html = getPanelHtml(view.webview, this.context.extensionUri, nonce);

    view.webview.onDidReceiveMessage((message) => this.handleMessage(message));
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.recomputeCited(0);
      }
    });
    view.onDidDispose(() => {
      this.view = undefined;
    });
  }

  refresh(): void {
    this.post();
  }

  private sanitize(input: Partial<Filters>): Filters {
    return {
      search: typeof input.search === "string" ? input.search : "",
      collection: typeof input.collection === "string" ? input.collection : "",
      tag: typeof input.tag === "string" ? input.tag : "",
      tab: TABS.includes(input.tab as Tab) ? (input.tab as Tab) : "library",
      sort: SORT_MODES.includes(input.sort as SortMode)
        ? (input.sort as SortMode)
        : DEFAULT_FILTERS.sort,
    };
  }

  private handleMessage(message: any): void {
    switch (message?.type) {
      case "ready":
        this.recomputeCited(0);
        break;
      case "filters":
        this.filters = this.sanitize({ ...this.filters, ...message.filters });
        this.context.workspaceState.update("sci2code.panelFilters", this.filters);
        this.page = 0;
        this.scheduleServerSearch();
        this.post();
        break;
      case "page":
        if (typeof message.page === "number") {
          this.page = message.page;
          this.post();
        }
        break;
      case "toggleOptions":
        this.showOptions = !this.showOptions;
        this.post();
        break;
      case "insert":
        if (typeof message.key === "string") {
          this.insert(message.key);
        }
        break;
      case "details":
        if (typeof message.key === "string") {
          this.openDetails(message.key);
        }
        break;
      case "closeDetails":
        this.detailsKey = "";
        this.post();
        break;
      case "logout":
        this.confirmLogout();
        break;
      case "refresh":
        vscode.commands.executeCommand("zotero.refresh");
        break;
      case "login":
        vscode.commands.executeCommand("sci2code.login");
        break;
      case "openKeys":
        vscode.env.openExternal(vscode.Uri.parse("https://www.zotero.org/settings/keys"));
        break;
      case "manual":
        vscode.commands.executeCommand("sci2code.insertManualCitation");
        break;
      case "bibliography":
        vscode.commands.executeCommand("sci2code.generateBibliography", {
          scope: message.scope,
          output: message.output,
        });
        break;
      case "editTemplate":
        vscode.commands.executeCommand("sci2code.editTemplateForCurrentLanguage");
        break;
      case "relink":
        if (typeof message.key === "string") {
          this.relink(message.key);
        }
        break;
      case "openWeb":
        this.openItem(typeof message.key === "string" ? message.key : this.selectedKey);
        break;
      case "copyKey":
        this.copy(this.keyOrSelected(message.key)?.key, "Zotero key");
        break;
      case "copyDoi":
        this.copy(this.keyOrSelected(message.key)?.doi, "DOI");
        break;
    }
  }

  private scheduleServerSearch(): void {
    clearTimeout(this.searchTimer);
    const term = this.filters.search.trim();
    const seq = ++this.searchSeq;

    if (term.length < SERVER_SEARCH_MIN_CHARS || this.filters.tab === "cited") {
      this.clearServerSearch();
      return;
    }
    if (term === this.serverTerm && !this.searchNote) {
      return;
    }
    this.searching = true;
    this.searchTimer = setTimeout(() => this.runServerSearch(term, seq), SERVER_SEARCH_DELAY_MS);
  }

  private clearServerSearch(): void {
    this.searching = false;
    this.searchNote = "";
    this.serverTerm = "";
    this.serverKeys = new Set();
    this.extraRaw = new Map();
  }

  private async runServerSearch(term: string, seq: number): Promise<void> {
    const userId = contextService.getContext(ZOTERO_CONTEXT.USERID);
    const offline = contextService.getContext(ZOTERO_CONTEXT.OFFLINE) === true;
    let note = "";
    let keys = new Set<string>();
    let extras = new Map<string, any>();

    try {
      const session = await vscode.authentication.getSession(
        ZoteroAuthenticationProvider.id,
        [],
        { createIfNone: false }
      );
      if (!userId || !session || offline) {
        throw new Error("offline");
      }
      const result = await searchZoteroItems(String(userId), session.accessToken, term);
      const known = new Set(this.items.map((i) => i.key));
      keys = new Set(result.items.map((r) => r.key));
      extras = new Map(
        result.items.filter((r) => !known.has(r.key) && r?.data).map((r) => [r.key, r])
      );
      if (!result.complete) {
        note = "Showing the first Zotero matches";
      }
    } catch {
      note = "Searching this library only";
    }

    if (seq !== this.searchSeq) {
      return;
    }
    this.searching = false;
    this.searchNote = note;
    this.serverTerm = term;
    this.serverKeys = keys;
    this.extraRaw = extras;
    this.page = 0;
    this.post();
  }

  private async confirmLogout(): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      "Log out of Zotero? You will need your API key to log in again.",
      { modal: true },
      "Log out"
    );
    if (choice === "Log out") {
      await vscode.commands.executeCommand("sci2code.logout");
    }
  }

  private setFeedback(text: string, warn = false): void {
    this.feedback = { text, warn };
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      this.feedback = { text: "", warn: false };
      this.post();
    }, FEEDBACK_MS);
  }

  private rawFor(key: string): any {
    return this.rawByKey.get(key) ?? this.extraRaw.get(key);
  }

  private findItem(key: string): PanelItem | undefined {
    const known = this.items.find((i) => i.key === key);
    if (known) {
      return known;
    }
    const extra = this.extraRaw.get(key);
    if (extra) {
      return toPanelItems([extra])[0];
    }
    return unresolvedAsItems(this.unresolved, DEFAULT_FILTERS).find((i) => i.key === key);
  }

  private insert(key: string): void {
    const unresolved = this.unresolved.some((u) => u.key === key);
    if (unresolved) {
      this.openDetails(key);
      return;
    }
    const raw = this.rawFor(key);
    const item = this.findItem(key);
    if (!raw || !item) {
      this.setFeedback("That reference is no longer in your library. Refresh and try again.", true);
      this.post();
      return;
    }
    this.selectedKey = key;
    if (item.needsReview) {
      this.openDetails(key);
      return;
    }
    if (!vscode.window.activeTextEditor) {
      this.setFeedback("Open a file and place the cursor where the citation should go.", true);
      this.post();
      return;
    }
    insertCitationFromSidebarCommand(raw);
    this.setFeedback(`Inserted: ${item.title}`);
    this.post();
  }

  private openDetails(key: string): void {
    const item = this.findItem(key);
    if (!item) {
      return;
    }
    this.selectedKey = key;
    this.detailsKey = key;
    if (item.unresolved) {
      this.setFeedback("This citation is not in your Zotero library. Add it to Zotero to link it.", true);
    } else if (item.needsReview) {
      this.setFeedback("This item has no title. Open it in Zotero to add details before citing it.", true);
    }
    this.post();
  }

  private selectedItem(): PanelItem | undefined {
    return this.findItem(this.selectedKey);
  }

  private async relink(key: string): Promise<void> {
    const unresolved = this.unresolved.find((u) => u.key === key);
    const editor = vscode.window.activeTextEditor;
    if (!unresolved || !editor) {
      this.setFeedback("Open the file that contains this citation first.", true);
      this.post();
      return;
    }

    let title = unresolved.title === unresolved.key ? "" : unresolved.title;
    if (!title) {
      title =
        (await vscode.window.showInputBox({
          prompt: "Title for the new Zotero item",
          ignoreFocusOut: true,
        })) || "";
      if (!title.trim()) {
        return;
      }
    }

    try {
      const created = await createManualItemInZotero({
        title,
        doi: unresolved.doi,
        url: unresolved.url,
        itemType: "document",
      });
      const document = editor.document;
      const text = document.getText();
      const edit = new vscode.WorkspaceEdit();
      for (let i = text.indexOf(key); i >= 0; i = text.indexOf(key, i + key.length)) {
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(i), document.positionAt(i + key.length)),
          created.key
        );
      }
      await vscode.workspace.applyEdit(edit);
      this.selectedKey = created.key;
      this.detailsKey = created.key;
      this.setFeedback(`Added to Zotero and linked: ${title}`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.setFeedback(`Could not add to Zotero: ${reason.replace(/\.$/, "")}.`, true);
    }
    this.recomputeCited(0);
  }

  private keyOrSelected(key: unknown): PanelItem | undefined {
    return typeof key === "string" ? this.findItem(key) : this.selectedItem();
  }

  private openItem(key: string): void {
    const url = this.findItem(key)?.url;
    if (!url) {
      vscode.window.showWarningMessage("Sci2Code: No URL available for this reference.");
      return;
    }
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async copy(value: string | undefined, label: string): Promise<void> {
    if (!value) {
      this.setFeedback(`This reference has no ${label}.`, true);
      this.post();
      return;
    }
    await vscode.env.clipboard.writeText(value);
    this.setFeedback(`Copied ${label}: ${value}`);
    this.post();
  }

  private loadLibrary(): void {
    const raw: any[] = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS) || [];
    if (raw === this.cachedRaw) {
      return;
    }
    this.cachedRaw = raw;
    this.items = toPanelItems(raw);
    this.rawByKey = new Map(raw.map((r) => [r.key, r]));
    this.searchIndex = new Map(
      raw.filter((r) => r?.data).map((r) => [r.key, searchText(r)])
    );
    this.recomputeCited(0);
  }

  private recomputeCited(delay: number): void {
    clearTimeout(this.citedTimer);
    this.citedTimer = setTimeout(() => {
      const editor = vscode.window.activeTextEditor;
      const known = new Set(this.items.map((i) => i.key));
      const text = editor ? editor.document.getText() : "";
      this.citedKeys = new Set(extractCitedKeys(text, known));
      this.unresolved = findUnresolvedCitations(text, known);
      this.post();
    }, delay);
  }

  private formatLabel(): string {
    const editor = vscode.window.activeTextEditor;
    return (editor && FORMAT_LABELS[editor.document.languageId]) || "Default";
  }

  private detailsModel(): (PanelItem & { code: string }) | null {
    const item = this.findItem(this.detailsKey);
    if (!item) {
      return null;
    }
    if (item.unresolved) {
      return { ...item, code: "" };
    }
    const raw = this.rawFor(item.key);
    if (!raw) {
      return null;
    }
    let code = "";
    if (!item.needsReview) {
      const languageId = vscode.window.activeTextEditor?.document.languageId || "default";
      try {
        code = renderTemplate(languageId, raw, {
          codeId: "<generated>",
          functionName: null,
        }).value;
      } catch {
        code = "";
      }
    }
    return { ...item, code };
  }

  private post(): void {
    if (!this.view) {
      return;
    }
    this.loadLibrary();

    const collections: any[] = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_COLLECTIONS) || [];
    const loggedIn = contextService.getContext(ZOTERO_CONTEXT.LOGGEDIN) === true;
    const editor = vscode.window.activeTextEditor;

    const tags = allTags(this.items);
    const options = collectionOptions(collections);
    if (this.filters.tag && !tags.includes(this.filters.tag)) {
      this.filters.tag = "";
    }
    if (this.filters.collection && !options.some((o) => o.key === this.filters.collection)) {
      this.filters.collection = "";
    }

    const extraItems = toPanelItems(Array.from(this.extraRaw.values()));
    const searchIndex = new Map(this.searchIndex);
    for (const raw of this.extraRaw.values()) {
      searchIndex.set(raw.key, searchText(raw));
    }
    const matched = filterItems(
      this.items.concat(extraItems),
      searchIndex,
      collections,
      this.filters,
      this.citedKeys,
      this.serverKeys
    );
    const visible =
      this.filters.tab === "cited"
        ? matched.concat(unresolvedAsItems(this.unresolved, this.filters))
        : matched;

    const progress = contextService.getContext(ZOTERO_CONTEXT.LOAD_PROGRESS) as
      | { loaded: number; total: number }
      | null
      | undefined;
    const loading = contextService.getContext(ZOTERO_CONTEXT.AUTHENTICATING) === true;
    const streaming = loading && !!progress && progress.total > progress.loaded;
    const unfiltered =
      !this.filters.search.trim() &&
      !this.filters.collection &&
      !this.filters.tag &&
      this.filters.tab === "library";
    const paged = paginate(
      visible,
      this.page,
      PAGE_SIZE,
      streaming && unfiltered && progress ? progress.total : 0
    );
    this.page = paged.page;

    this.view.webview.postMessage({
      type: "model",
      model: {
        loggedIn,
        loading: contextService.getContext(ZOTERO_CONTEXT.AUTHENTICATING) === true,
        username: contextService.getContext(ZOTERO_CONTEXT.USERNAME) || "",
        syncedAt: contextService.getContext(ZOTERO_CONTEXT.LAST_SYNCED) || 0,
        filters: this.filters,
        filterCount: (this.filters.collection ? 1 : 0) + (this.filters.tag ? 1 : 0),
        showOptions: this.showOptions,
        collections: options,
        tags,
        libraryCount: this.items.length,
        citedCount: this.items.filter((i) => this.citedKeys.has(i.key)).length + this.unresolved.length,
        total: paged.total,
        loadingRows: streaming ? paged.pending : 0,
        loadProgress: streaming && progress ? progress : null,
        items: paged.items,
        page: paged.page,
        pageCount: paged.pageCount,
        searching: this.searching,
        searchNote: this.searchNote,
        cached: contextService.getContext(ZOTERO_CONTEXT.CACHED) === true,
        offline: contextService.getContext(ZOTERO_CONTEXT.OFFLINE) === true,
        pageFrom: paged.from,
        pageTo: paged.to,
        selectedKey: this.selectedKey,
        details: this.detailsModel(),
        hasEditor: !!editor,
        fileName: editor ? editor.document.fileName.split(/[/\\]/).pop() : "",
        formatLabel: this.formatLabel(),
        feedback: this.feedback,
      },
    });
  }
}
