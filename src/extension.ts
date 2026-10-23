import * as vscode from "vscode";
import { PanelProvider, PANEL_VIEW_ID } from "./panel/panelProvider";
import { ZoteroAuthenticationProvider } from "./providers/authProvider";
import { generateSession } from "./auth/auth";
import {
  insertCitationCommand,
  insertCitationFromSidebarCommand,
  insertManualCitationCommand,
} from "./features/insertCitationCommand";
import {
  registerCompletion,
  triggerPatternManager,
} from "./features/docCompletion";
import { generateBibliographyCommand } from "./features/bibliographyService";
import { registerCitationHover } from "./features/citationHover";
import { contextService } from "./services/contextService";
import { libraryCache } from "./services/libraryCache";
import { ZOTERO_CONTEXT } from "./system/constants";
import { Sci2CodeAPI, CitationItem } from "./api/types";
import { getZoteroItemTitle } from "./utils/zotero.utils";

const BACKGROUND_SYNC_MS = 5 * 60 * 1000;
const FOCUS_SYNC_MIN_MS = 60 * 1000;

let zoteroStatusItem: vscode.StatusBarItem;
let completionProviders: vscode.Disposable[] = [];
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "Sci2Code" is now active!');
  // Create output channel for debugging
  outputChannel = vscode.window.createOutputChannel("Sci2Code");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('Sci2Code extension activated');

  const panelProvider = new PanelProvider(context);
  let refreshTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    panelProvider,
    vscode.window.registerWebviewViewProvider(PANEL_VIEW_ID, panelProvider),
    contextService.onDidChange(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => panelProvider.refresh(), 50);
    })
  );

  vscode.authentication.onDidChangeSessions((e) => {
    if (e.provider.id === ZoteroAuthenticationProvider.id) {
      panelProvider.refresh();
    }
  });

  libraryCache.init(context);

  const activateSession = async (
    createIfNone: boolean,
    forceNewSession: boolean = false,
    background: boolean = false
  ) => {
    const result = await generateSession(createIfNone, forceNewSession, background);
    panelProvider.refresh();
    return result;
  };
  restoreCachedLibrary(context).then(() => activateSession(false));

  let lastBackgroundCheck = Date.now();
  const backgroundCheck = () => {
    if (contextService.getContext(ZOTERO_CONTEXT.LOGGEDIN) !== true) {
      return;
    }
    lastBackgroundCheck = Date.now();
    activateSession(false, false, true);
  };
  const backgroundTimer = setInterval(backgroundCheck, BACKGROUND_SYNC_MS);
  context.subscriptions.push(
    { dispose: () => clearInterval(backgroundTimer) },
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused && Date.now() - lastBackgroundCheck > FOCUS_SYNC_MIN_MS) {
        backgroundCheck();
      }
    })
  );
  zoteroStatusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  context.subscriptions.push(zoteroStatusItem);
  updateStatusBar();
  zoteroStatusItem.show();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("sci2code.apiKey")) {
        updateStatusBar();
        // Re-authenticate when API key changes in settings
        const config = vscode.workspace.getConfiguration("sci2code");
        const apiKey = config.get<string>("apiKey");
        
        if (apiKey && apiKey.trim()) {
          // Update the secret storage with the new API key
          const authProvider = new ZoteroAuthenticationProvider(context.secrets);
          await context.secrets.store(ZoteroAuthenticationProvider.secretKey, apiKey);
          
          // Clear old context and trigger re-authentication with the new key
          contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, false);
          contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, []);
          contextService.setContext(ZOTERO_CONTEXT.CACHED, false);
          await libraryCache.clear();
          
          // Re-authenticate with new key
          await activateSession(false);
        } else {
          // If API key is cleared, logout
          contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, false);
          contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, []);
          panelProvider.refresh();
        }
      }

      if (
        e.affectsConfiguration("sci2code.triggers") ||
        e.affectsConfiguration("sci2code.languageSpecificTriggers")
      ) {
        console.log(
          "Sci2Code trigger configuration changed, re-registering completion providers..."
        );
        triggerPatternManager.updatePatterns();
        reregisterCompletionProviders(context);
      }
    })
  );

  registerStaticCommands(context, panelProvider, activateSession);
  registerCompletionProviders(context);
  context.subscriptions.push(registerCitationHover());

  // Export Public API for other extensions (e.g., OntoCode)
  const api: Sci2CodeAPI = {
    getZoteroLibrary: async () => {
      const items = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);
      return (items || []).filter((item: any) => item.data.itemType !== 'note');
    },

    getZoteroItem: async (key: string) => {
      const items = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);
      if (!items) return null;
      return items.find((item: any) => item.key === key) || null;
    },

    getCitationMetadata: async (key: string) => {
      const item = await api.getZoteroItem(key);
      if (!item) return null;

      const citation: CitationItem = {
        key: item.key,
        title: item.data.title || 'Untitled',
        creators: item.data.creators || [],
        date: item.data.date || '',
        doi: item.data.DOI,
        url: item.links?.alternate?.href,
        itemType: item.data.itemType,
        abstractNote: item.data.abstractNote,
        publicationTitle: item.data.publicationTitle,
        volume: item.data.volume,
        issue: item.data.issue,
        pages: item.data.pages,
        publisher: item.data.publisher,
        tags: item.data.tags
      };

      return citation;
    },

    formatCitationForOntology: async (key: string, format: 'turtle' | 'rdfxml' = 'turtle') => {
      const citation = await api.getCitationMetadata(key);
      if (!citation) throw new Error(`Citation with key ${key} not found`);

      if (format === 'turtle') {
        return formatAsTurtle(citation);
      } else {
        return formatAsRDFXML(citation);
      }
    },

    isAuthenticated: async () => {
      const items = contextService.getContext(ZOTERO_CONTEXT.ZOTERO_ITEMS);
      return Array.isArray(items) && items.length > 0;
    }
  };

  return api;
}

function formatAsTurtle(citation: CitationItem): string {
  const lines = [
    `# Citation for: ${citation.title}`,
    `[ a prov:Entity ;`
  ];

  lines.push(`  dc:title "${escapeString(citation.title)}" ;`);

  if (citation.date) {
    const dateStr = formatDate(citation.date);
    lines.push(`  dc:issued "${dateStr}"^^xsd:date ;`);
  }

  if (citation.creators && citation.creators.length > 0) {
    citation.creators.forEach((creator, idx) => {
      const name = `${creator.firstName} ${creator.lastName}`.trim();
      const comma = idx < citation.creators.length - 1 ? ' ,' : ' ;';
      lines.push(`  prov:wasAttributedTo [ foaf:name "${escapeString(name)}" ]${comma}`);
    });
  }

  if (citation.doi) {
    lines.push(`  dc:identifier <http://dx.doi.org/${citation.doi}> ;`);
  } else if (citation.url) {
    lines.push(`  dc:source <${citation.url}> ;`);
  }

  if (citation.abstractNote) {
    lines.push(`  dc:description "${escapeString(citation.abstractNote)}" ;`);
  }

  if (citation.publicationTitle) {
    lines.push(`  dc:isPartOf "${escapeString(citation.publicationTitle)}" ;`);
  }

  if (citation.itemType) {
    lines.push(`  dc:type "${citation.itemType}" ;`);
  }

  // Remove trailing semicolon from last line
  const lastLine = lines[lines.length - 1];
  lines[lines.length - 1] = lastLine.replace(/\s;$/, '');

  lines.push(`] .`);
  return lines.join('\n');
}

function formatAsRDFXML(citation: CitationItem): string {
  const lines = [
    `<!-- Citation for: ${citation.title} -->`,
    `<rdf:Description>`,
    `  <rdf:type rdf:resource="http://www.w3.org/ns/prov#Entity"/>`,
    `  <dc:title>${escapeXML(citation.title)}</dc:title>`
  ];

  if (citation.date) {
    const dateStr = formatDate(citation.date);
    lines.push(`  <dc:issued rdf:datatype="http://www.w3.org/2001/XMLSchema#date">${dateStr}</dc:issued>`);
  }

  if (citation.creators && citation.creators.length > 0) {
    citation.creators.forEach(creator => {
      const name = `${creator.firstName} ${creator.lastName}`.trim();
      lines.push(`  <prov:wasAttributedTo>`);
      lines.push(`    <foaf:Person>`);
      lines.push(`      <foaf:name>${escapeXML(name)}</foaf:name>`);
      lines.push(`    </foaf:Person>`);
      lines.push(`  </prov:wasAttributedTo>`);
    });
  }

  if (citation.doi) {
    lines.push(`  <dc:identifier rdf:resource="http://dx.doi.org/${citation.doi}"/>`);
  } else if (citation.url) {
    lines.push(`  <dc:source rdf:resource="${citation.url}"/>`);
  }

  if (citation.abstractNote) {
    lines.push(`  <dc:description>${escapeXML(citation.abstractNote)}</dc:description>`);
  }

  if (citation.publicationTitle) {
    lines.push(`  <dc:isPartOf>${escapeXML(citation.publicationTitle)}</dc:isPartOf>`);
  }

  if (citation.itemType) {
    lines.push(`  <dc:type>${citation.itemType}</dc:type>`);
  }

  lines.push(`</rdf:Description>`);
  return lines.join('\n');
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(date: string): string {
  // Try to parse various date formats and return ISO format
  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  // If parsing fails, try to extract year
  const yearMatch = date.match(/\d{4}/);
  return yearMatch ? `${yearMatch[0]}-01-01` : date;
}

function registerStaticCommands(
  context: vscode.ExtensionContext,
  panelProvider: PanelProvider,
  activateSession: (
    createIfNone: boolean,
    forceNewSession?: boolean,
    background?: boolean
  ) => Promise<{ isSessionGenerated: boolean }>
) {
  context.subscriptions.push(
    vscode.authentication.registerAuthenticationProvider(
      ZoteroAuthenticationProvider.id,
      "Zotero",
      new ZoteroAuthenticationProvider(context.secrets)
    ),
    vscode.commands.registerCommand("sci2code.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "sci2code");
    }),
    vscode.commands.registerCommand("sci2code.showLogs", () => {
      outputChannel.show(true);
    }),
    vscode.commands.registerCommand("sci2code.editTemplateForCurrentLanguage", async () => {
      const supported = ["javascript", "typescript", "python", "r", "julia", "default"];
      const editor = vscode.window.activeTextEditor;
      const currentLang = editor?.document.languageId;
      const pickItems = supported.map((id) => ({
        label: id === currentLang ? `$(star-full) ${id}` : id,
        description: id === currentLang ? "current editor language" : id === "default" ? "fallback for any other language" : "",
        value: id,
      }));
      const picked = await vscode.window.showQuickPick(pickItems, {
        placeHolder: "Select the language whose citation template you want to edit",
      });
      if (!picked) return;
      // Open settings.json with the cursor near the chosen language.
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        `sci2code.templates`
      );
      vscode.window.showInformationMessage(
        `Editing the "${picked.value}" template. Tip: placeholders are case-insensitive, e.g. \${zotero.doi} works.`
      );
    }),
    vscode.commands.registerCommand("sci2code.resetTemplates", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Reset all Sci2Code citation templates to their defaults? Your customised templates will be lost.",
        { modal: true },
        "Reset"
      );
      if (confirm !== "Reset") return;
      const config = vscode.workspace.getConfiguration("sci2code");
      await config.update("templates", undefined, vscode.ConfigurationTarget.Global);
      await config.update("templates", undefined, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage("Sci2Code citation templates reset to defaults.");
    }),
    vscode.commands.registerCommand("sci2code.logout", async () => {
      try {
        const session = await vscode.authentication.getSession(
          ZoteroAuthenticationProvider.id,
          [],
          { createIfNone: false }
        );
        if (session) {
          const authProvider = new ZoteroAuthenticationProvider(
            context.secrets
          );
          await authProvider.removeSession(session.id);
          const config = vscode.workspace.getConfiguration("sci2code");
          for (const target of [
            vscode.ConfigurationTarget.Global,
            vscode.ConfigurationTarget.Workspace,
          ]) {
            try {
              await config.update("apiKey", undefined, target);
            } catch {
              continue;
            }
          }
          panelProvider.refresh();
          vscode.window.showInformationMessage(
            "Successfully logged out of Zotero."
          );
        } else {
          vscode.window.showInformationMessage("You are not logged in.");
        }
      } catch (e) {
        console.error("Logout failed:", e);
        vscode.window.showErrorMessage("Failed to log out. Please try again.");
      }
    }),
    vscode.commands.registerCommand("sci2code.login", () =>
      activateSession(true, true)
    ),
    vscode.commands.registerCommand("sci2code.insertZoteroCitation", () =>
      insertCitationCommand(zoteroStatusItem)
    ),
    vscode.commands.registerCommand(
      "sci2code.insertCitationFromSidebar",
      insertCitationFromSidebarCommand
    ),
    vscode.commands.registerCommand(
      "sci2code.insertManualCitation",
      insertManualCitationCommand
    ),
    vscode.commands.registerCommand(
      "sci2code.generateBibliography",
      generateBibliographyCommand
    ),
    vscode.commands.registerCommand("zotero.refresh", async () => {
      // Re-authenticate to fetch fresh data from Zotero
      const result = await activateSession(false);
      if (result.isSessionGenerated) {
        vscode.window.showInformationMessage("Zotero library refreshed.");
      }
    })
  );
}

async function restoreCachedLibrary(context: vscode.ExtensionContext) {
  const hasCredentials =
    !!(await context.secrets.get(ZoteroAuthenticationProvider.secretKey)) ||
    !!vscode.workspace.getConfiguration("sci2code").get<string>("apiKey")?.trim();
  if (!hasCredentials) {
    return;
  }
  const snapshot = await libraryCache.load();
  if (!snapshot || snapshot.items.length === 0) {
    return;
  }
  contextService.setContext(ZOTERO_CONTEXT.USERNAME, snapshot.username);
  contextService.setContext(ZOTERO_CONTEXT.USERID, snapshot.userId);
  contextService.setContext(ZOTERO_CONTEXT.ZOTERO_COLLECTIONS, snapshot.collections);
  contextService.setContext(ZOTERO_CONTEXT.LAST_SYNCED, snapshot.syncedAt);
  contextService.setContext(ZOTERO_CONTEXT.LIBRARY_VERSION, snapshot.libraryVersion);
  contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, snapshot.items);
  contextService.setContext(ZOTERO_CONTEXT.CACHED, true);
  contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, true);
}

function registerCompletionProviders(context: vscode.ExtensionContext) {
  console.log("Registering completion providers with current configuration...");
  disposeCompletionProviders();

  const providersToRegister = [
    {
      id: "javascript",
      selector: [
        { language: "typescriptreact", scheme: "file" },
        { language: "javascriptreact", scheme: "file" },
        { language: "typescript", scheme: "file" },
        { language: "javascript", scheme: "file" },
        { language: "typescriptreact", scheme: "vscode-notebook-cell" },
        { language: "javascriptreact", scheme: "vscode-notebook-cell" },
        { language: "typescript", scheme: "vscode-notebook-cell" },
        { language: "javascript", scheme: "vscode-notebook-cell" },
      ],
    },
    {
      id: "python",
      selector: [
        { language: "python", scheme: "file" },
        { language: "python", scheme: "vscode-notebook-cell" },
      ],
    },
    {
      id: "r",
      selector: [
        { language: "r", scheme: "file" },
        { language: "r", scheme: "vscode-notebook-cell" },
      ],
    },
    {
      id: "julia",
      selector: [
        { language: "julia", scheme: "file" },
        { language: "julia", scheme: "vscode-notebook-cell" },
      ],
    },
  ];

  providersToRegister.forEach((p) => {
    completionProviders.push(registerCompletion(p.id, p.selector));
  });

  completionProviders.forEach((provider) =>
    context.subscriptions.push(provider)
  );
  console.log(`Registered ${completionProviders.length} completion providers`);
}

function reregisterCompletionProviders(context: vscode.ExtensionContext) {
  console.log(
    "Re-registering completion providers due to configuration change..."
  );
  registerCompletionProviders(context);
}

function disposeCompletionProviders() {
  completionProviders.forEach((provider) => {
    try {
      provider.dispose();
    } catch (error) {
      console.error("Error disposing completion provider:", error);
    }
  });
  completionProviders = [];
  console.log("Disposed existing completion providers");
}

function updateStatusBar() {
  const config = vscode.workspace.getConfiguration("sci2code");
  if (config.get("apiKey")) {
    zoteroStatusItem.text = "$(zap) Zotero: Ready";
    zoteroStatusItem.tooltip =
      "Zotero API is configured. Click to insert citation.";
    zoteroStatusItem.command = "sci2code.insertZoteroCitation";
  } else {
    zoteroStatusItem.text = "$(warning) Zotero: Not Configured";
    zoteroStatusItem.tooltip = "Click to configure Zotero API Key.";
    zoteroStatusItem.command = "sci2code.openSettings";
  }
}

export function deactivate() {
  if (zoteroStatusItem) {
    zoteroStatusItem.dispose();
  }

  disposeCompletionProviders();
}