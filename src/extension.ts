import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebarProvider";
import { ZoteroAuthenticationProvider } from "./providers/authProvider";
import { generateSession } from "./auth/auth";
import { registerJsDocCompletion } from "./features/jsDocCompletion";
import { registerPyDocCompletion } from "./features/pyDocCompletion";
import { registerRDocCompletion } from "./features/rCompletion";
import { registerJuliaDocCompletion } from "./features/juliaCompletion";
import { insertCitationCommand, insertCitationFromSidebarCommand } from "./features/insertCitationCommand";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "Sci2Code" is now active!');

  const sidebarProvider = new SidebarProvider();
  vscode.window.registerTreeDataProvider("zotero-documents", sidebarProvider);
  
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

 

  context.subscriptions.push(
    ...[
      vscode.authentication.registerAuthenticationProvider(
        ZoteroAuthenticationProvider.id, "Zotero", new ZoteroAuthenticationProvider(context.secrets)
      ),
      vscode.commands.registerCommand("sci2code.login", () => activateSession(true)),
      
      vscode.commands.registerCommand("sci2code.insertZoteroCitation", insertCitationCommand),

      vscode.commands.registerCommand("sci2code.insertCitationFromSidebar", insertCitationFromSidebarCommand),
      
      vscode.commands.registerCommand("zotero.search", () => sidebarProvider.search()),
      vscode.commands.registerCommand("zotero.clearFilter", () => sidebarProvider.clearFilter()),
      vscode.commands.registerCommand("zotero.refresh", () => sidebarProvider.refresh()),

     registerJsDocCompletion([
        { language: "typescript", scheme: "file" },
        { language: "javascript", scheme: "file" },
        { language: "typescriptreact", scheme: "file" },
        { language: "javascriptreact", scheme: "file" },
      ]),
      registerPyDocCompletion([
        { language: "python", scheme: "file" },
      ]),
      registerRDocCompletion([
        { language: "r", scheme: "file" },
      ]),
      registerJuliaDocCompletion([
        { language: "julia", scheme: "file" },
      ]),
    ]
  );
}

export function deactivate() {}