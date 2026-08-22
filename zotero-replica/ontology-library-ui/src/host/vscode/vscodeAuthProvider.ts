import type { AuthProvider, AuthStatus } from '../../api/authProvider';

const TIMEOUT_MS = 3000;

/**
 * Awaits a one-shot handshake with the extension host: sends 'ready', waits
 * for 'authStatus'. The raw JWT never crosses this boundary - the extension
 * persists it in VS Code SecretStorage (surviving webview reload, VS Code
 * restart, and machine restart - see src/zoteroReplica/authSession.ts) and
 * reports only {available, userId, email} here.
 */
export class VsCodeAuthProvider implements AuthProvider {
  getStatus(): Promise<AuthStatus> {
    if (!window.vscode) return Promise.resolve({ available: false });

    return new Promise<AuthStatus>((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve({ available: false });
      }, TIMEOUT_MS);

      function onMessage(event: MessageEvent) {
        if (event.data?.type !== 'authStatus') return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        resolve({ available: !!event.data.available, userId: event.data.userId, email: event.data.email });
      }

      window.addEventListener('message', onMessage);
      window.vscode!.postMessage({ type: 'ready' });
    });
  }

  logout(): Promise<void> {
    if (!window.vscode) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve();
      }, TIMEOUT_MS);

      function onMessage(event: MessageEvent) {
        if (event.data?.type !== 'authStatus') return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        resolve();
      }

      window.addEventListener('message', onMessage);
      window.vscode!.postMessage({ type: 'logout' });
    });
  }
}
