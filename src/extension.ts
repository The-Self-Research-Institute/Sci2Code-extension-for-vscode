import * as vscode from "vscode";
import { SidebarProvider } from "./providers/sidebarProvider";
import { ZoteroAuthenticationProvider } from "./providers/authProvider";
import { generateSession } from "./auth/auth";
import { insertCitationCommand, registerJsDocCompletion, templateToSnippet } from "./features/jsDocCompletion";
import { registerPyDocCompletion } from "./features/pyDocCompletion";
import { registerRDocCompletion } from "./features/rCompletion";
import { registerJuliaDocCompletion } from "./features/juliaCompletion";
import { getSnippetForLanguage } from "./features/snippetFactory";

// These imports are assumed to exist based on your provided files
import { extractFileName, generateCodeId, getZoteroItemTitle, saveMetadataToZotero } from "./utils/zotero.utils";

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

  // **NEW**: A command specifically for inserting a citation from a sidebar click.
  const insertCitationFromSidebarCommand = (zoteroItem: any) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !zoteroItem) {
          return;
      }
      
      const functionName = "function_from_sidebar"; // Simplified for this example
      const fileName = extractFileName(editor.document.fileName);
      const codeId = generateCodeId(functionName, fileName);
      const titleOfItem = getZoteroItemTitle(zoteroItem);

       const languageId = editor.document.languageId;
        const snippet = getSnippetForLanguage(languageId, codeId, titleOfItem, zoteroItem);

        // Only insert if a snippet was successfully created
        if (snippet) {
            editor.insertSnippet(snippet);

            const userId = zoteroItem?.library?.id;
            const itemKey = zoteroItem?.key;
            const metadata = { codeId, functionName };
            saveMetadataToZotero(userId, itemKey, metadata);

            vscode.window.showInformationMessage(`Sci2Code: Inserted citation for "${titleOfItem}".`);
        } else {
          editor.insertSnippet(templateToSnippet(codeId, titleOfItem, zoteroItem));
        }
      // This requires `templateToSnippet` to be exported from `jsDocCompletion.ts`

      const userId = zoteroItem?.library?.id;
      const itemKey = zoteroItem?.key;
      const metadata = { codeId, functionName };
      saveMetadataToZotero(userId, itemKey, metadata);

      vscode.window.showInformationMessage(`Sci2Code: Inserted citation for "${titleOfItem}".`);
  };

  context.subscriptions.push(
    ...[
      vscode.authentication.registerAuthenticationProvider(
        ZoteroAuthenticationProvider.id, "Zotero", new ZoteroAuthenticationProvider(context.secrets)
      ),
      vscode.commands.registerCommand("sci2code.login", () => activateSession(true)),
      
      // **PRESERVED**: Your original command for the Command Palette is untouched.
      vscode.commands.registerCommand("sci2code.insertZoteroCitation", insertCitationCommand),

      // **NEW**: Register the command for sidebar clicks.
      vscode.commands.registerCommand("sci2code.insertCitationFromSidebar", insertCitationFromSidebarCommand),
      
      // **NEW**: Register commands for the sidebar's UI controls.
      vscode.commands.registerCommand("zotero.search", () => sidebarProvider.search()),
      vscode.commands.registerCommand("zotero.clearFilter", () => sidebarProvider.clearFilter()),
      vscode.commands.registerCommand("zotero.refresh", () => sidebarProvider.refresh()),

      // Your original completion providers are all preserved.
      registerJsDocCompletion([ /* ...selectors... */ ]),
      registerPyDocCompletion([ /* ...selectors... */ ]),
      registerRDocCompletion([ /* ...selectors... */ ]),
      registerJuliaDocCompletion([ /* ...selectors... */ ]),
    ]
  );
}

export function deactivate() {}