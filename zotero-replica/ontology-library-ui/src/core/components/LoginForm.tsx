import { useState } from 'react';
import { login, register } from '../../api/auth';
import { ApiError } from '../../api/transport';
import { Dialog } from './Dialog';

interface LoginFormProps {
  onClose: () => void;
  /** Called once a token has been stored, so the caller can refresh live data. */
  onAuthenticated: () => void;
}

/**
 * Replica-owned login/register UI, shared by both hosts. On the web host,
 * the response carries the real JWT, stored under the 'authToken' key
 * WebAuthProvider/WebTransport read/send. On the VS Code host, the
 * extension has already persisted the token in SecretStorage and strips it
 * before relaying the response here (see webviewPanel.ts) - there is
 * nothing to store client-side, `onAuthenticated` alone triggers the
 * subsequent `getAuthStatus()` re-check that picks up the new session.
 */
export function LoginForm({ onClose, onAuthenticated }: LoginFormProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = mode === 'login' ? await login(email, password) : await register(email, password);
      if (response.token) {
        window.localStorage.setItem('authToken', response.token);
      }
      onAuthenticated();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the dataserver.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={mode === 'login' ? 'Log In' : 'Create Account'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          type="email"
          className="dialog__input"
          autoFocus
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="dialog__input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="dialog__hint dialog__hint--error">{error}</p>}
        <div className="dialog__actions">
          <button
            type="button"
            className="toolbar__button"
            onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
          >
            {mode === 'login' ? 'Need an account?' : 'Have an account?'}
          </button>
          <button type="submit" className="toolbar__button toolbar__button--primary" disabled={busy || !email || !password}>
            {mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
