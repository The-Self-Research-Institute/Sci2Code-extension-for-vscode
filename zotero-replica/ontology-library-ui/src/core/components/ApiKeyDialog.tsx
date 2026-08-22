import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { generateApiKey, getApiKeyStatus, revokeApiKey, type ApiKeyStatus } from '../../api/apiKey';
import { ApiError } from '../../api/transport';
import { Copy, Check } from '../icons';

interface ApiKeyDialogProps {
  onClose: () => void;
}

function formatDate(iso?: string): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * "API Access" panel: generate/revoke the Replica API key external clients
 * (Sci2Code) use to authenticate directly to the dataserver - a credential
 * separate from this webview's own login session (see api/apiKey.ts). The
 * raw key is only ever shown once, right after generation; reopening this
 * dialog later shows only whether an (unrevealed) key is currently active.
 */
export function ApiKeyDialog({ onClose }: ApiKeyDialogProps) {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getApiKeyStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not check API key status.');
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const result = await generateApiKey();
      setRevealedKey(result.apiKey);
      setStatus({ exists: true, createdAt: result.createdAt, lastUsedAt: undefined });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to generate an API key.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await revokeApiKey();
      setRevealedKey(null);
      setStatus({ exists: false });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to revoke the API key.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy automatically - select the key above and copy it manually.');
    }
  };

  return (
    <Dialog title="API Access" onClose={onClose}>
      <p className="dialog__hint">Your API key lets Sci2Code access your Replica library directly, without a Zotero account.</p>
      {error && <p className="dialog__hint dialog__hint--error">{error}</p>}

      {loadingStatus ? (
        <p className="dialog__hint">Checking...</p>
      ) : revealedKey ? (
        <>
          <div className="api-key__reveal">
            <code className="api-key__value">{revealedKey}</code>
            <button type="button" className="toolbar__button" onClick={handleCopy} title="Copy to clipboard">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="dialog__hint dialog__hint--error">
            Keep this key private. It will not be shown again - paste it into Sci2Code now.
          </p>
        </>
      ) : status?.exists ? (
        <p className="dialog__hint">
          You have an active API key (created {formatDate(status.createdAt)}, last used {formatDate(status.lastUsedAt)}). Regenerating
          replaces it - anything using the old key will stop working.
        </p>
      ) : (
        <p className="dialog__hint">No API key yet.</p>
      )}

      <div className="dialog__actions">
        <button type="button" className="toolbar__button" onClick={onClose}>
          Close
        </button>
        {status?.exists && !revealedKey && (
          <button type="button" className="toolbar__button toolbar__button--danger" onClick={handleRevoke} disabled={busy}>
            Revoke
          </button>
        )}
        <button type="button" className="toolbar__button toolbar__button--primary" onClick={handleGenerate} disabled={busy || loadingStatus}>
          {status?.exists ? 'Regenerate API Key' : 'Generate API Key'}
        </button>
      </div>
    </Dialog>
  );
}
