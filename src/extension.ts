import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebarProvider";
import { ZoteroAuthenticationProvider } from "./providers/authProvider";
import { generateSession } from "./auth/auth";
import {
  insertCitationCommand,
  insertCitationFromSidebarCommand,
} from "./features/insertCitationCommand";
import {
  registerCompletion,
  triggerPatternManager,
} from "./features/docCompletion";

let zoteroStatusItem: vscode.StatusBarItem;

let completionProviders: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "Sci2Code" is now active!');

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
    vscode.commands.registerCommand("zotero.search", () =>
      sidebarProvider.search()
    ),
    vscode.commands.registerCommand("zotero.clearFilter", () =>
      sidebarProvider.clearFilter()
    ),
    vscode.commands.registerCommand("zotero.refresh", () =>
      sidebarProvider.refresh()
    )
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
