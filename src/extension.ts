import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebarProvider";
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
import { contextService } from "./services/contextService";
import { ZOTERO_CONTEXT } from "./system/constants";
import { Sci2CodeAPI, CitationItem } from "./api/types";
import { getZoteroItemTitle } from "./utils/zotero.utils";

let zoteroStatusItem: vscode.StatusBarItem;
let completionProviders: vscode.Disposable[] = [];
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "Sci2Code" is now active!');

  // Create output channel for debugging
  outputChannel = vscode.window.createOutputChannel("Sci2Code");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('Sci2Code extension activated');

  const sidebarProvider = new SidebarProvider();
  vscode.window.registerTreeDataProvider("zotero-documents", sidebarProvider);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("zotero-documents", sidebarProvider)
  );

  vscode.authentication.onDidChangeSessions((e) => {
    if (e.provider.id === ZoteroAuthenticationProvider.id) {
      sidebarProvider.refresh();
    }
  });

  const activateSession = async (createIfNone: boolean) => {
    await generateSession(createIfNone);
    sidebarProvider.refresh();
  };

  activateSession(false);

  zoteroStatusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  context.subscriptions.push(zoteroStatusItem);
  updateStatusBar();
  zoteroStatusItem.show();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("sci2code.apiKey")) {
        updateStatusBar();
        // Re-authenticate when API key changes in settings
        const config = vscode.workspace.getConfiguration("sci2code");
        const apiKey = config.get<string>("apiKey");
        if (apiKey && apiKey.trim()) {
          // Trigger re-authentication with the new key
          activateSession(false);
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

  registerStaticCommands(context, sidebarProvider, activateSession);
  registerCompletionProviders(context);

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
  sidebarProvider: SidebarProvider,
  activateSession: (createIfNone: boolean) => Promise<void>
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
          sidebarProvider.refresh();
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
      activateSession(true)
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
    vscode.commands.registerCommand("zotero.search", () =>
      sidebarProvider.search()
    ),
    vscode.commands.registerCommand("zotero.clearFilter", () =>
      sidebarProvider.clearFilter()
    ),
    vscode.commands.registerCommand("zotero.refresh", async () => {
      // Re-authenticate to fetch fresh data from Zotero
      await activateSession(false);
      sidebarProvider.refresh();
      vscode.window.showInformationMessage("Zotero library refreshed.");
    })
  );
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
      ],
    },
    { id: "python", selector: { language: "python", scheme: "file" } },
    { id: "r", selector: { language: "r", scheme: "file" } },
    { id: "julia", selector: { language: "julia", scheme: "file" } },
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
    zoteroStatusItem.command =
      "workbench.action.openSettings?%22sci2code.apiKey%22";
  }
}

export function deactivate() {
  if (zoteroStatusItem) {
    zoteroStatusItem.dispose();
  }

  disposeCompletionProviders();
}