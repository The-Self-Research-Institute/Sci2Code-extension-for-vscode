import { setTransport } from '../../api/client';
import { setAuthProvider } from '../../api/authProvider';
import { VsCodeTransport } from './vscodeTransport';
import { VsCodeAuthProvider } from './vscodeAuthProvider';

export function isVsCodeHost(): boolean {
  return typeof window !== 'undefined' && !!(window as any).vscode;
}

export function installVsCodeHost(): void {
  setTransport(new VsCodeTransport());
  setAuthProvider(new VsCodeAuthProvider());
}
