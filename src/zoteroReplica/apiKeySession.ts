import * as vscode from "vscode";

/**
 * Sci2Code's OWN credential for connecting to the Zotero Replica dataserver -
 * a Replica API key, generated from within the Replica webview's "API
 * Access" panel and pasted here via the "Zotero Replica: Login with API
 * Key" command (see extension.ts). This is deliberately a SEPARATE
 * SecretStorage entry from the Replica webview's own login JWT
 * (see authSession.ts's ReplicaAuthSession) - the two credentials have
 * independent lifecycles: logging out of the Replica webview must not
 * disconnect Sci2Code, and disconnecting Sci2Code must not log the webview
 * out. Persists exactly like every other VS Code secret: across webview
 * reloads, VS Code restarts, and Extension Development Host restarts, until
 * explicitly cleared.
 */
const API_KEY_SECRET = "sci2code.replicaApiKey";
const USER_ID_SECRET = "sci2code.replicaApiKeyUserId";

export class ReplicaApiKeySession {
	constructor(private readonly secrets: vscode.SecretStorage) {}

	async getApiKey(): Promise<string | undefined> {
		return this.secrets.get(API_KEY_SECRET);
	}

	async getUserId(): Promise<string | undefined> {
		return this.secrets.get(USER_ID_SECRET);
	}

	/** Stores the API key together with the userId resolved for it via GET /auth/whoami - never asks the user to supply that id themselves. */
	async setCredentials(apiKey: string, userId: string): Promise<void> {
		await this.secrets.store(API_KEY_SECRET, apiKey);
		await this.secrets.store(USER_ID_SECRET, userId);
	}

	async clear(): Promise<void> {
		await this.secrets.delete(API_KEY_SECRET);
		await this.secrets.delete(USER_ID_SECRET);
	}

	async isConfigured(): Promise<boolean> {
		return !!(await this.getApiKey());
	}
}
