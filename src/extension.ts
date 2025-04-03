// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebarProvider";
import { ZoteroAuthenticationProvider } from "./providers/authProvider";
import { generateSession } from "./auth/auth";
import { registerJsDocCompletion } from "./features/jsDocCompletion";
import { registerPyDocCompletion } from "./features/pyDocCompletion";

// This method is called when extension is activated
export function activate(context: vscode.ExtensionContext) {
  // This line of code will only be executed once extension is activated
  console.log('Extension "sci-2-code" is now active!');

  const sidebarProvider = new SidebarProvider();
  vscode.window.registerTreeDataProvider("zotero-documents", sidebarProvider);

  vscode.authentication.onDidChangeSessions((e) => {
    sidebarProvider.refresh();
  });

  const activateSession = async (createIfNone: boolean) => {
    await generateSession(createIfNone);
    sidebarProvider.refresh();
  };

  activateSession(false);

  context.subscriptions.push(
    ...[
      vscode.authentication.registerAuthenticationProvider(
        ZoteroAuthenticationProvider.id,
        "Zotero",
        new ZoteroAuthenticationProvider(context.secrets)
      ),
      vscode.commands.registerCommand("sci-2-code.login", async () => {
        console.log("Actiavting");
        await activateSession(true);
      }),
      registerJsDocCompletion([
        { language: "typescript", scheme: "file" },
        { language: "javascript", scheme: "file" },
        { language: "typescriptreact", scheme: "file" },
        { language: "javascriptreact", scheme: "file" },
      ]),
      registerPyDocCompletion([
        { language: "python", scheme: "file" }, // Registering for Python files
      ]),
    ]
  );
}

// This method is called when extension is deactivated
export function deactivate() {}
