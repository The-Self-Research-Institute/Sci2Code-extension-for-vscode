// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebarProvider";
import { ZoteroAuthenticationProvider } from "./providers/authProvider";
import { contextService } from "./services/contextService";
import { ZOTERO_CONTEXT } from "./system/constants";
import { generateSession } from "./auth/auth";

// This method is called when extension is activated
export function activate(context: vscode.ExtensionContext) {
  // This line of code will only be executed once extension is activated
  console.log('Extension "zotero-plugin" is now active!');

  const sidebarProvider = new SidebarProvider();
  vscode.window.registerTreeDataProvider("zotero-documents", sidebarProvider);

  context.subscriptions.push(
    vscode.authentication.registerAuthenticationProvider(
      ZoteroAuthenticationProvider.id,
      "Zotero",
      new ZoteroAuthenticationProvider(context.secrets)
    )
  );

  vscode.authentication.onDidChangeSessions((e) => {
    sidebarProvider.refresh();
  });

  const activateSession = async (createIfNone: boolean) => {
    await generateSession(createIfNone);
    sidebarProvider.refresh();
  };

  activateSession(false);

  const zoteroItemsProvider = vscode.languages.registerCompletionItemProvider(
    [
      { language: "typescript", scheme: "file" },
      { language: "javascript", scheme: "file" },
      { language: "typescriptreact", scheme: "file" },
      { language: "javascriptreact", scheme: "file" },
    ],
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        const zoteroItems = contextService.getContext(
          ZOTERO_CONTEXT.ZOTERO_ITEMS
        );

        // get all text until the `position` and check if it reads `zotero.`
        const linePrefix = document
          .lineAt(position)
          .text.slice(0, position.character);

        if (!linePrefix.endsWith("zotero.")) {
          return undefined;
        }

        const completionItems = zoteroItems.map((zoteroItem: any) => {
          return new vscode.CompletionItem(
            `${zoteroItem?.data?.title} | ${zoteroItem?.links?.alternate?.href}`,
            vscode.CompletionItemKind.Text
          );
        });

        return completionItems;
      },
    },
    "." // triggered whenever a '.' is being typed
  );

  context.subscriptions.push(zoteroItemsProvider);

  const loginDisposable = vscode.commands.registerCommand(
    "zotero-plugin.login",
    async () => {
      console.log("actiavting");
      await activateSession(true);
    }
  );

  context.subscriptions.push(loginDisposable);
}

// This method is called when extension is deactivated
export function deactivate() {}
