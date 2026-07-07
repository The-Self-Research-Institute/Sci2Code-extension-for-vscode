import {
  authentication,
  AuthenticationProvider,
  AuthenticationProviderAuthenticationSessionsChangeEvent,
  AuthenticationProviderSessionOptions,
  AuthenticationSession,
  Disposable,
  Event,
  EventEmitter,
  SecretStorage,
  window,
} from "vscode";
import { contextService } from "../services/contextService";
import { ZOTERO_CONTEXT } from "../system/constants";
import { getUserDetails } from "../zotero/api";

class ZoteroSession implements AuthenticationSession {
  // We don't know the user's account name, so we'll just use a constant
  readonly account = {
    id: ZoteroAuthenticationProvider.id,
    label: "Personal Access Token",
  };
  // This id isn't used for anything here, so we set it to a constant
  readonly id = ZoteroAuthenticationProvider.id;
  // We don't know what scopes the Access Token has, so we have an empty array here.
  readonly scopes = [];

  /**
   *
   * @param accessToken The personal access token to use for authentication
   */
  constructor(public readonly accessToken: string) { }
}

export class ZoteroAuthenticationProvider
  implements AuthenticationProvider, Disposable {
  static id = "zoteropat";
  static secretKey = "ZoteroPAT";

  // this property is used to determine if the token has been changed in another window of VS Code.
  // It is used in the checkForUpdates function.
  private currentToken: Promise<string | undefined> | undefined;
  private initializedDisposable: Disposable | undefined;

  private _onDidChangeSessions =
    new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
  get onDidChangeSessions(): Event<AuthenticationProviderAuthenticationSessionsChangeEvent> {
    return this._onDidChangeSessions.event;
  }

  constructor(private readonly secretStorage: SecretStorage) { }

  dispose(): void {
    this.initializedDisposable?.dispose();
  }

  private ensureInitialized(): void {
    if (this.initializedDisposable === undefined) {
      void this.cacheTokenFromStorage();

      this.initializedDisposable = Disposable.from(
        // This onDidChange event happens when the secret storage changes in _any window_ since
        // secrets are shared across all open windows.
        this.secretStorage.onDidChange((e) => {
          if (e.key === ZoteroAuthenticationProvider.secretKey) {
            void this.checkForUpdates();
          }
        }),
        // This fires when the user initiates a "silent" auth flow via the Accounts menu.
        authentication.onDidChangeSessions((e) => {
          if (e.provider.id === ZoteroAuthenticationProvider.id) {
            void this.checkForUpdates();
          }
        })
      );
    }
  }

  // This is a crucial function that handles whether or not the token has changed in
  // a different window of VS Code and sends the necessary event if it has.
  private async checkForUpdates(): Promise<void> {
    const added: AuthenticationSession[] = [];
    const removed: AuthenticationSession[] = [];
    const changed: AuthenticationSession[] = [];

    const previousToken = await this.currentToken;
    const session = (await this.getSessions())[0];

    if (session?.accessToken && !previousToken) {
      added.push(session);
    } else if (!session?.accessToken && previousToken) {
      removed.push(session);
    } else if (session?.accessToken !== previousToken) {
      changed.push(session);
    } else {
      return;
    }

    void this.cacheTokenFromStorage();
    this._onDidChangeSessions.fire({
      added: added,
      removed: removed,
      changed: changed,
    });
  }

  private cacheTokenFromStorage() {
    this.currentToken = this.secretStorage.get(
      ZoteroAuthenticationProvider.secretKey
    ) as Promise<string | undefined>;
    return this.currentToken;
  }

  // This function is called first when `vscode.authentication.getSessions` is called.
  async getSessions(
    scopes?: readonly string[],
    options?: AuthenticationProviderSessionOptions
  ): Promise<AuthenticationSession[]> {
    this.ensureInitialized();
    let token = await this.cacheTokenFromStorage();

    // Only adopt the settings-configured key when there's no stored token yet
    // (first run / settings.json-only setup). Once a token is stored -- whether
    // from a validated login prompt or a prior settings sync -- it is the
    // source of truth; a stale value left in settings must not silently
    // clobber it on every session check. Explicit settings edits are handled
    // separately via the `onDidChangeConfiguration` listener in extension.ts.
    if (!token) {
      const { workspace } = await import('vscode');
      const config = workspace.getConfiguration('sci2code');
      const apiKeyFromSettings = config.get<string>('apiKey');

      if (apiKeyFromSettings && apiKeyFromSettings.trim()) {
        token = apiKeyFromSettings.trim();
        await this.secretStorage.store(
          ZoteroAuthenticationProvider.secretKey,
          token
        );
        this.currentToken = Promise.resolve(token);
      }
    }

    const result = token ? [new ZoteroSession(token)] : [];
    return result;
  }

  // This function is called after `this.getSessions` is called and only when:
  // - `this.getSessions` returns nothing but `createIfNone` was set to `true` in `vscode.authentication.getSessions`
  // - `vscode.authentication.getSessions` was called with `forceNewSession: true`
  // - The end user initiates the "silent" auth flow via the Accounts menu
  async createSession(_scopes: string[]): Promise<AuthenticationSession> {
    this.ensureInitialized();

    let lastAttempt: string | undefined;

    while (true) {
      const input = await window.showInputBox({
        ignoreFocusOut: true,
        prompt: "Enter Zotero API Key",
        placeHolder: "Zotero API Key",
        password: true,
        value: lastAttempt,
      });

      if (!input) {
        throw new Error("Zotero Access Token is required");
      }

      const token = input.trim();
      lastAttempt = token;

      const validation = await this.validateApiKey(token);
      if (validation.valid) {
        await this.secretStorage.store(
          ZoteroAuthenticationProvider.secretKey,
          token
        );

        contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, true);

        return new ZoteroSession(token);
      }

      const retry = await window.showErrorMessage(
        `Zotero | ${validation.message}`,
        { modal: true },
        "Try Again"
      );
      if (retry !== "Try Again") {
        throw new Error("Zotero sign-in cancelled.");
      }
    }
  }

  private async validateApiKey(
    token: string
  ): Promise<{ valid: boolean; message: string }> {
    try {
      const response = await getUserDetails(token);
      if (response.ok) {
        return { valid: true, message: "" };
      }
      if (response.status === 403) {
        return {
          valid: false,
          message:
            "That key was rejected by Zotero. Check it has library read access at zotero.org/settings/keys, then try again.",
        };
      }
      if (response.status === 404) {
        return {
          valid: false,
          message:
            "That doesn't look like a valid Zotero API key. Double-check you copied the whole key with no extra spaces, then try again.",
        };
      }
      return {
        valid: false,
        message: `Zotero API returned an unexpected error (${response.status} ${response.statusText}). Please try again.`,
      };
    } catch {
      return {
        valid: false,
        message:
          "Couldn't reach the Zotero API. Check your internet connection, then try again.",
      };
    }
  }

  // This function is called when the end user signs out of the account.
  async removeSession(_sessionId: string): Promise<void> {
    const token = await this.secretStorage.get(
      ZoteroAuthenticationProvider.secretKey
    );
    if (!token) {
      return;
    }

    const added: AuthenticationSession[] = [];
    const changed: AuthenticationSession[] = [];

    await this.secretStorage.delete(ZoteroAuthenticationProvider.secretKey);

    contextService.setContext(ZOTERO_CONTEXT.ZOTERO_ITEMS, []);
    contextService.setContext(ZOTERO_CONTEXT.LOGGEDIN, false);

    this._onDidChangeSessions.fire({
      removed: [new ZoteroSession(token)],
      added,
      changed,
    });
  }
}
