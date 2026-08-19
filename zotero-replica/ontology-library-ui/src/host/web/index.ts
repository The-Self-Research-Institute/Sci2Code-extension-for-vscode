import { setTransport } from '../../api/client';
import { setAuthProvider } from '../../api/authProvider';
import { WebTransport } from './webTransport';
import { WebAuthProvider } from './webAuthProvider';

export function installWebHost(): void {
  setTransport(new WebTransport());
  setAuthProvider(new WebAuthProvider());
}
