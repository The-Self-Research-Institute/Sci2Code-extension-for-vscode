import { useMemo, useState } from 'react';
import { Dialog } from './Dialog';
import { ApiError } from '../../api/transport';
import { Pencil, Trash2, X, Check } from '../icons';
import type { Tag } from '../../api/types';

interface ManageTagsDialogProps {
  tags: Tag[];
  onRenameTag: (oldName: string, newName: string) => Promise<void>;
  onDeleteTag: (tagName: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Library-wide tag management: rename or delete a tag across every item that
 * carries it, via the dataserver's atomic bulk endpoints (TagController's
 * PATCH .../tags/{name} and DELETE .../tags). Distinct from the per-item tag
 * editor on ItemDetails' Info tab, which only ever touches one item's tag list.
 */
export function ManageTagsDialog({ tags, onRenameTag, onDeleteTag, onClose }: ManageTagsDialogProps) {
  const [query, setQuery] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteConfirmTag, setDeleteConfirmTag] = useState<string | null>(null);
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => [...tags].sort((a, b) => a.tag.localeCompare(b.tag)), [tags]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((t) => t.tag.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  const startEdit = (tag: string) => {
    setError(null);
    setEditingTag(tag);
    setEditValue(tag);
  };

  const commitEdit = async () => {
    if (!editingTag) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === editingTag) {
      setEditingTag(null);
      return;
    }
    setBusyTag(editingTag);
    setError(null);
    try {
      await onRenameTag(editingTag, trimmed);
      setEditingTag(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to rename this tag.');
    } finally {
      setBusyTag(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmTag) return;
    setBusyTag(deleteConfirmTag);
    setError(null);
    try {
      await onDeleteTag(deleteConfirmTag);
      setDeleteConfirmTag(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete this tag.');
    } finally {
      setBusyTag(null);
    }
  };

  if (deleteConfirmTag) {
    return (
      <Dialog title="Delete Tag" onClose={() => setDeleteConfirmTag(null)}>
        <p className="dialog__hint">
          Remove the tag "{deleteConfirmTag}" from every item in your library? This cannot be undone.
        </p>
        {error && <p className="dialog__hint dialog__hint--error">{error}</p>}
        <div className="dialog__actions">
          <button type="button" className="toolbar__button" onClick={() => setDeleteConfirmTag(null)} disabled={busyTag === deleteConfirmTag}>
            Cancel
          </button>
          <button
            type="button"
            className="toolbar__button toolbar__button--danger"
            onClick={confirmDelete}
            disabled={busyTag === deleteConfirmTag}
          >
            Delete
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Manage Tags" onClose={onClose} className="dialog--wide">
      <p className="dialog__hint">
        Rename or delete a tag across your whole library. Renaming merges into an existing tag of the same name if one exists.
      </p>
      {error && <p className="dialog__hint dialog__hint--error">{error}</p>}
      <input
        type="text"
        className="dialog__input"
        placeholder="Filter tags..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="manage-tags__list">
        {filtered.length === 0 && <p className="dialog__hint">{tags.length === 0 ? 'No tags yet.' : 'No tags match.'}</p>}
        {filtered.map((t) => (
          <div key={t.tag} className="manage-tags__row">
            {editingTag === t.tag ? (
              <>
                <input
                  type="text"
                  className="manage-tags__edit-input"
                  value={editValue}
                  autoFocus
                  disabled={busyTag === t.tag}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitEdit();
                    if (e.key === 'Escape') setEditingTag(null);
                  }}
                />
                <button
                  type="button"
                  className="manage-tags__icon-button"
                  title="Save"
                  disabled={busyTag === t.tag}
                  onClick={() => void commitEdit()}
                >
                  <Check size={13} />
                </button>
                <button type="button" className="manage-tags__icon-button" title="Cancel" onClick={() => setEditingTag(null)}>
                  <X size={13} />
                </button>
              </>
            ) : (
              <>
                <span className="manage-tags__name">{t.tag}</span>
                <span className="manage-tags__count">{t.meta.numItems}</span>
                <button
                  type="button"
                  className="manage-tags__icon-button"
                  title="Rename"
                  disabled={busyTag === t.tag}
                  onClick={() => startEdit(t.tag)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  className="manage-tags__icon-button"
                  title="Delete"
                  disabled={busyTag === t.tag}
                  onClick={() => setDeleteConfirmTag(t.tag)}
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="dialog__actions">
        <button type="button" className="toolbar__button" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
