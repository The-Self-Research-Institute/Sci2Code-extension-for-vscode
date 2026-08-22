import { useEffect, useRef, useState } from 'react';
import type { Collection, Creator, Item } from '../../api/types';
import { ApiError, type BinaryDownloadResult } from '../../api/transport';
import { getItemTypeIcon, getItemTypeColorClass, Paperclip, Link2, Plus, X, ChevronUp, ChevronDown, Sparkles } from '../icons';
import { getItemTypeFields, getItemTypeCreatorTypes } from '../../api/metadata';

/** Fields without an explicit label fall back to their raw dataserver name. */
const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  publicationTitle: 'Publication',
  bookTitle: 'Book Title',
  DOI: 'DOI',
  ISBN: 'ISBN',
  ISSN: 'ISSN',
  url: 'URL',
  abstractNote: 'Abstract',
  publisher: 'Publisher',
  volume: 'Volume',
  issue: 'Issue',
  pages: 'Pages',
  language: 'Language',
  extra: 'Extra',
  place: 'Place',
  edition: 'Edition',
  series: 'Series',
  seriesNumber: 'Series Number',
  seriesTitle: 'Series Title',
  seriesText: 'Series Text',
  numberOfVolumes: 'Number of Volumes',
  numPages: 'Number of Pages',
  shortTitle: 'Short Title',
  accessDate: 'Access Date',
  archive: 'Archive',
  archiveLocation: 'Archive Location',
  libraryCatalog: 'Library Catalog',
  callNumber: 'Call Number',
  rights: 'Rights',
  reportNumber: 'Report Number',
  reportType: 'Report Type',
  institution: 'Institution',
  thesisType: 'Thesis Type',
  university: 'University',
  websiteTitle: 'Website Title',
  websiteType: 'Website Type',
  journalAbbreviation: 'Journal Abbreviation',
  note: 'Note',
};

/** Long free-text fields get a textarea instead of a single-line input. */
const LONG_FIELDS = new Set(['abstractNote', 'extra']);

/**
 * Files are shipped as base64 over the VS Code postMessage bridge
 * (host/vscode/vscodeTransport.ts) rather than streamed, so both the
 * webview and extension-host processes hold the whole encoded file in
 * memory at once - this cap keeps that bounded. A plain-browser host has
 * no such limit, but the cap applies uniformly for one predictable UX.
 */
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

/** Strips the "data:<mime>;base64," prefix FileReader.readAsDataURL() produces, leaving raw base64. */
function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1);
}

function triggerBrowserDownload(base64: string, contentType: string, filename: string): void {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface ItemDetailsProps {
  selectedItems: Item[];
  collections: Collection[];
  /** Full item set (including children) - used to resolve attachments/relations. */
  allItems: Item[];
  onSelectItem: (key: string) => void;
  onAddTag: (itemKey: string, tag: string) => void;
  onRemoveTag: (itemKey: string, tag: string) => void;
  onRenameTag: (itemKey: string, oldTag: string, newTag: string) => void;
  onAddNote: (itemKey: string, text: string) => void;
  onUpdateNote: (noteItemKey: string, text: string) => void;
  onDeleteNote: (noteItemKey: string) => void;
  onAddAttachment: (itemKey: string, file: { filename: string; contentType: string; base64Data: string }) => Promise<void>;
  onDownloadAttachment: (attachmentItemKey: string) => Promise<BinaryDownloadResult>;
  onDeleteAttachment: (attachmentItemKey: string) => void;
  onUpdateField: (itemKey: string, field: string, value: string) => void;
  onUpdateCreators: (itemKey: string, creators: Creator[]) => void;
  onAddToCollection: (collectionKey: string, itemKeys: string[]) => void;
}

type Tab = 'info' | 'creators' | 'tags' | 'collections' | 'notes' | 'attachments' | 'related';

/**
 * Editable metadata form. Which fields are offered is driven by the
 * dataserver's own schema (GET /itemTypeFields?itemType=...) rather than a
 * hard-coded list, so it's automatically correct for every item type the
 * backend knows about (see itemTypeOptions.ts / SchemaService.java) without
 * this component needing to change when a new type is added.
 *
 * Each field commits independently on blur (only if actually changed) -
 * matching the same interaction pattern TagsTab's rename-on-blur already
 * uses elsewhere in this file, rather than inventing a separate "Save" flow.
 */
function InfoTab({
  item,
  fields,
  fieldsLoading,
  onUpdateField,
}: {
  item: Item;
  fields: string[];
  fieldsLoading: boolean;
  onUpdateField: (field: string, value: string) => void;
}) {
  const { data } = item;
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => setDrafts({}), [item.key]);

  const valueFor = (field: string) => drafts[field] ?? String(data[field] ?? '');

  const commit = (field: string) => {
    const draft = drafts[field];
    if (draft === undefined) return;
    const original = String(data[field] ?? '');
    if (draft !== original) onUpdateField(field, draft);
  };

  if (fieldsLoading) {
    return <p className="item-details__empty-tab">Loading fields…</p>;
  }

  return (
    <dl className="item-details__fields">
      {fields.map((field) => (
        <div key={field} style={{ display: 'contents' }}>
          <dt>{FIELD_LABELS[field] ?? field}</dt>
          <dd>
            {LONG_FIELDS.has(field) ? (
              <textarea
                className="item-details__field-textarea"
                value={valueFor(field)}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [field]: e.target.value }))}
                onBlur={() => commit(field)}
              />
            ) : (
              <input
                type="text"
                className="item-details__field-input"
                value={valueFor(field)}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [field]: e.target.value }))}
                onBlur={() => commit(field)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            )}
          </dd>
        </div>
      ))}
      {fields.length === 0 && <p className="item-details__empty-tab">No editable fields for this item type.</p>}
    </dl>
  );
}

/**
 * Add/remove/reorder creators, with a type picker sourced from the
 * dataserver's per-item-type creator type list (GET /itemTypeCreatorTypes).
 * Name edits commit on blur (like InfoTab's fields); add/remove/reorder/type
 * changes commit immediately, matching TagsTab's immediate-commit pattern
 * for discrete actions.
 */
function CreatorEditor({
  item,
  creatorTypes,
  onUpdateCreators,
}: {
  item: Item;
  creatorTypes: string[];
  onUpdateCreators: (creators: Creator[]) => void;
}) {
  const creators = item.data.creators ?? [];
  const [drafts, setDrafts] = useState<Record<number, { firstName?: string; lastName?: string }>>({});

  useEffect(() => setDrafts({}), [item.key]);

  const replaceAt = (index: number, patch: Partial<Creator>) => {
    onUpdateCreators(creators.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const removeAt = (index: number) => {
    // Clears drafts, not just calling onUpdateCreators: `drafts` is keyed by
    // array INDEX, and every index after the removed one now refers to a
    // different creator. Left uncleared, a still-focused/previously-edited
    // name field would keep showing the removed creator's old draft text
    // pinned to its old index instead of the creator that shifted into it.
    onUpdateCreators(creators.filter((_, i) => i !== index));
    setDrafts({});
  };

  const addCreator = () => {
    onUpdateCreators([...creators, { creatorType: creatorTypes[0] ?? 'author', firstName: '', lastName: '' }]);
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= creators.length) return;
    const next = [...creators];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdateCreators(next);
    // Same reasoning as removeAt(): `drafts` is keyed by index, so swapping
    // two creators' array positions without also clearing it left the name
    // inputs at those two indices still showing whichever text was last
    // drafted THERE - i.e. the wrong creator's name - even though the type
    // dropdown (which has no such per-index override) correctly showed the
    // swapped creatorType. This is the reported "names don't move, only the
    // role/type appears to" bug.
    setDrafts({});
  };

  const commitName = (index: number, field: 'firstName' | 'lastName') => {
    const draft = drafts[index]?.[field];
    if (draft === undefined) return;
    const original = creators[index]?.[field] ?? '';
    if (draft !== original) replaceAt(index, { [field]: draft });
  };

  return (
    <div className="item-details__creator-editor">
      {creators.length === 0 && <p className="item-details__empty-tab">No creators.</p>}
      {creators.map((creator, index) => (
        <div className="item-details__creator-row" key={index}>
          <select
            className="item-details__creator-type"
            value={creator.creatorType}
            onChange={(e) => replaceAt(index, { creatorType: e.target.value })}
          >
            {!creatorTypes.includes(creator.creatorType) && <option value={creator.creatorType}>{creator.creatorType}</option>}
            {creatorTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="item-details__creator-name"
            placeholder="First name"
            value={drafts[index]?.firstName ?? creator.firstName ?? ''}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [index]: { ...prev[index], firstName: e.target.value } }))}
            onBlur={() => commitName(index, 'firstName')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <input
            type="text"
            className="item-details__creator-name"
            placeholder="Last name"
            value={drafts[index]?.lastName ?? creator.lastName ?? ''}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [index]: { ...prev[index], lastName: e.target.value } }))}
            onBlur={() => commitName(index, 'lastName')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <button
            type="button"
            className="item-details__creator-icon-button"
            onClick={() => move(index, -1)}
            disabled={index === 0}
            title="Move up"
            aria-label="Move creator up"
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            className="item-details__creator-icon-button"
            onClick={() => move(index, 1)}
            disabled={index === creators.length - 1}
            title="Move down"
            aria-label="Move creator down"
          >
            <ChevronDown size={12} />
          </button>
          <button
            type="button"
            className="item-details__creator-icon-button"
            onClick={() => removeAt(index)}
            title="Remove creator"
            aria-label="Remove creator"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button type="button" className="item-details__tag-add-button item-details__creator-add" onClick={addCreator}>
        <Plus size={12} /> Add creator
      </button>
    </div>
  );
}

/**
 * Manual tag management for the selected item. `type: 1` tags (came from an
 * import - see core/import/mapToItem.ts) render with a subdued style and a
 * dashed border so they read as distinct from tags the user typed
 * themselves (type 0/absent) - both can be removed, but only renaming/
 * adding goes through here rather than the import pipeline.
 */
function TagsTab({
  item,
  onAddTag,
  onRemoveTag,
  onRenameTag,
}: {
  item: Item;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onRenameTag: (oldTag: string, newTag: string) => void;
}) {
  const tags = item.data.tags ?? [];
  const [newTagValue, setNewTagValue] = useState('');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const submitNewTag = () => {
    const trimmed = newTagValue.trim();
    if (!trimmed) return;
    onAddTag(trimmed);
    setNewTagValue('');
  };

  const startEditing = (tag: string) => {
    setEditingTag(tag);
    setEditValue(tag);
  };

  const commitEdit = () => {
    if (!editingTag) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== editingTag) onRenameTag(editingTag, trimmed);
    setEditingTag(null);
  };

  return (
    <div className="item-details__tags-editor">
      {tags.length === 0 ? (
        <p className="item-details__empty-tab">No tags.</p>
      ) : (
        <div className="item-details__tags">
          {tags.map((tag) =>
            editingTag === tag.tag ? (
              <input
                key={tag.tag}
                autoFocus
                className="item-details__tag-edit-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditingTag(null);
                }}
              />
            ) : (
              <span
                key={tag.tag}
                className={tag.type === 1 ? 'item-details__tag item-details__tag--auto' : 'item-details__tag item-details__tag--manual'}
                title={tag.type === 1 ? 'Automatically generated/imported tag - double-click to rename' : 'Manually assigned tag - double-click to rename'}
              >
                {tag.type === 1 && <Sparkles size={9} className="item-details__tag-auto-icon" aria-hidden="true" />}
                <button type="button" className="item-details__tag-label" onDoubleClick={() => startEditing(tag.tag)}>
                  {tag.tag}
                </button>
                <button
                  type="button"
                  className="item-details__tag-remove"
                  onClick={() => onRemoveTag(tag.tag)}
                  title="Remove tag"
                  aria-label={`Remove tag ${tag.tag}`}
                >
                  <X size={10} />
                </button>
              </span>
            ),
          )}
        </div>
      )}
      <div className="item-details__tag-add">
        <input
          type="text"
          className="item-details__tag-add-input"
          placeholder="Add tag…"
          value={newTagValue}
          onChange={(e) => setNewTagValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitNewTag();
          }}
        />
        <button type="button" className="item-details__tag-add-button" onClick={submitNewTag} disabled={!newTagValue.trim()}>
          <Plus size={12} /> Add tag
        </button>
      </div>
    </div>
  );
}

function CollectionsTab({
  item,
  collections,
  onAddToCollection,
}: {
  item: Item;
  collections: Collection[];
  onAddToCollection: (collectionKey: string) => void;
}) {
  const memberOf = collections.filter((c) => item.data.collections?.includes(c.key));
  const notMemberOf = collections.filter((c) => !item.data.collections?.includes(c.key));
  const [picking, setPicking] = useState(false);

  return (
    <div className="item-details__collections-editor">
      {memberOf.length === 0 ? (
        <p className="item-details__empty-tab">Not in any collection.</p>
      ) : (
        <ul className="item-details__collection-list">
          {memberOf.map((c) => (
            <li key={c.key}>{c.data.name}</li>
          ))}
        </ul>
      )}
      {notMemberOf.length > 0 &&
        (picking ? (
          <select
            className="item-details__creator-type"
            style={{ flex: '0 0 auto', width: '100%' }}
            autoFocus
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onAddToCollection(e.target.value);
              setPicking(false);
            }}
            onBlur={() => setPicking(false)}
          >
            <option value="" disabled>
              Choose a collection…
            </option>
            {notMemberOf.map((c) => (
              <option key={c.key} value={c.key}>
                {c.data.name}
              </option>
            ))}
          </select>
        ) : (
          <button type="button" className="item-details__tag-add-button" onClick={() => setPicking(true)}>
            <Plus size={12} /> Add to Collection
          </button>
        ))}
    </div>
  );
}

/**
 * Notes are child items (itemType 'note', parentItem = this item's key) -
 * the same modeling convention attachments already use - persisted through
 * useLibraryData's local store like everything else. (The real Dataserver's
 * `note` schema is still an empty field list, so this intentionally doesn't
 * round-trip through it yet - see useLibraryData.ts's doc comment on the
 * future Dataserver-backed swap.)
 */
function NotesTab({
  item,
  allItems,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}: {
  item: Item;
  allItems: Item[];
  onAddNote: (text: string) => void;
  onUpdateNote: (noteKey: string, text: string) => void;
  onDeleteNote: (noteKey: string) => void;
}) {
  const notes = allItems.filter((i) => i.data.parentItem === item.key && i.data.itemType === 'note');
  const [newNoteText, setNewNoteText] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const submitNewNote = () => {
    const trimmed = newNoteText.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setNewNoteText('');
  };

  const startEditing = (note: Item) => {
    setEditingKey(note.key);
    setEditText(String(note.data.note ?? ''));
  };

  const commitEdit = () => {
    if (!editingKey) return;
    onUpdateNote(editingKey, editText);
    setEditingKey(null);
  };

  return (
    <div className="item-details__notes">
      {notes.length === 0 && <p className="item-details__empty-tab">No notes.</p>}
      {notes.length > 0 && (
        <ul className="item-details__note-list">
          {notes.map((note) => (
            <li key={note.key} className="item-details__note">
              {editingKey === note.key ? (
                <>
                  <textarea
                    className="item-details__note-edit-textarea"
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div className="item-details__note-actions">
                    <button type="button" className="item-details__note-link" onClick={() => setEditingKey(null)}>
                      Cancel
                    </button>
                    <button type="button" className="item-details__note-link item-details__note-link--primary" onClick={commitEdit}>
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="item-details__note-text">{String(note.data.note ?? '')}</p>
                  <div className="item-details__note-actions">
                    <button type="button" className="item-details__note-link" onClick={() => startEditing(note)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="item-details__note-link item-details__note-link--danger"
                      onClick={() => onDeleteNote(note.key)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="item-details__note-add">
        <textarea
          className="item-details__note-add-textarea"
          placeholder="Add a note…"
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
        />
        <button type="button" className="item-details__tag-add-button" onClick={submitNewNote} disabled={!newNoteText.trim()}>
          <Plus size={12} /> Add note
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attachments are child items (itemType 'attachment', parentItem = this
 * item's key), matching the shape imported/mock attachment data already
 * used (linkMode/filename/contentType). File selection reuses the plain
 * `<input type="file">` + FileReader pattern already proven in the Import
 * feature - it works natively inside a VS Code webview (native OS file
 * picker, no extension-host messaging needed) exactly like a normal
 * browser. Bytes are inlined as a data URL and persisted through
 * useLibraryData's local store like every other item; a real dataserver
 * swap would use GridFS instead (AttachmentController/AttachmentService
 * already exist there) without changing this component's props.
 */
function AttachmentsTab({
  item,
  allItems,
  onAddAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
}: {
  item: Item;
  allItems: Item[];
  onAddAttachment: (file: { filename: string; contentType: string; base64Data: string }) => Promise<void>;
  onDownloadAttachment: (attachmentItemKey: string) => Promise<BinaryDownloadResult>;
  onDeleteAttachment: (attachmentKey: string) => void;
}) {
  const children = allItems.filter((i) => i.data.parentItem === item.key && i.data.itemType === 'attachment');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setError(`"${file.name}" is too large (max ${Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)}MB).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true);
      try {
        await onAddAttachment({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          base64Data: stripDataUrlPrefix(String(reader.result)),
        });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not add this attachment.');
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => setError(`Could not read "${file.name}".`);
    reader.readAsDataURL(file);
  };

  const handleDownload = async (att: Item, filename: string) => {
    setError(null);
    setDownloadingKey(att.key);
    try {
      const result = await onDownloadAttachment(att.key);
      triggerBrowserDownload(result.base64, result.contentType, result.filename || filename);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Could not download "${filename}".`);
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className="item-details__attachments">
      {error && <p className="dialog__hint dialog__hint--error">{error}</p>}
      {children.length === 0 ? (
        <p className="item-details__empty-tab">No attachments.</p>
      ) : (
        <ul className="item-details__attachment-list">
          {children.map((att) => {
            const filename = String(att.data.filename ?? att.data.title ?? att.key);
            const hasFile = att.data.linkMode !== 'linked_url' && att.data.linkMode !== 'linked_file';
            return (
              <li key={att.key}>
                <Paperclip size={13} className="item-icon--attachment" />
                <span className="item-details__attachment-name">{filename}</span>
                {typeof att.data.size === 'number' && (
                  <span className="item-details__attachment-meta">{formatBytes(att.data.size)}</span>
                )}
                {hasFile && (
                  <button
                    type="button"
                    className="item-details__attachment-action"
                    disabled={downloadingKey === att.key}
                    onClick={() => void handleDownload(att, filename)}
                  >
                    {downloadingKey === att.key ? 'Downloading...' : 'Download'}
                  </button>
                )}
                <button
                  type="button"
                  className="item-details__tag-remove"
                  onClick={() => onDeleteAttachment(att.key)}
                  title="Remove attachment"
                  aria-label={`Remove attachment ${filename}`}
                >
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
      <button type="button" className="item-details__tag-add-button" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
        <Plus size={12} /> {uploading ? 'Uploading...' : 'Add attachment'}
      </button>
    </div>
  );
}

/**
 * Dataserver's `relations` field is real and round-trips (ItemResponseMapper),
 * but is an unvalidated free-form map with no defined convention for what a
 * value means. This resolves any value that happens to match another item's
 * key in the currently-loaded set - a reasonable reading of real data, not a
 * fabricated relationship.
 */
function RelatedTab({ item, allItems, onSelectRelated }: { item: Item; allItems: Item[]; onSelectRelated: (key: string) => void }) {
  const relationValues = Object.values(item.data.relations ?? {}).flatMap((v) => (Array.isArray(v) ? v : [v]));
  const related = allItems.filter((i) => relationValues.includes(i.key));
  if (related.length === 0) {
    return <p className="item-details__empty-tab">No related items.</p>;
  }
  return (
    <ul className="item-details__related-list">
      {related.map((rel) => {
        const Icon = getItemTypeIcon(rel.data.itemType);
        return (
          <li key={rel.key}>
            <button type="button" className="item-details__related-link" onClick={() => onSelectRelated(rel.key)}>
              <Icon size={13} className={getItemTypeColorClass(rel.data.itemType)} />
              <Link2 size={11} className="item-details__related-link-icon" />
              {String(rel.data.title ?? rel.key)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ItemDetails({
  selectedItems,
  collections,
  allItems,
  onSelectItem,
  onAddTag,
  onRemoveTag,
  onRenameTag,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
  onUpdateField,
  onUpdateCreators,
  onAddToCollection,
}: ItemDetailsProps) {
  const [tab, setTab] = useState<Tab>('info');
  const [fieldsByType, setFieldsByType] = useState<Record<string, string[]>>({});
  const [creatorTypesByType, setCreatorTypesByType] = useState<Record<string, string[]>>({});
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  const currentItemType = selectedItems.length === 1 ? selectedItems[0].data.itemType : undefined;

  useEffect(() => {
    if (!currentItemType) return;
    if (fieldsByType[currentItemType] && creatorTypesByType[currentItemType]) return;
    let cancelled = false;
    setFieldsLoading(true);
    Promise.all([getItemTypeFields(currentItemType), getItemTypeCreatorTypes(currentItemType)])
      .then(([fields, creatorTypes]) => {
        if (cancelled) return;
        setFieldsByType((prev) => ({ ...prev, [currentItemType]: fields }));
        setCreatorTypesByType((prev) => ({ ...prev, [currentItemType]: creatorTypes }));
      })
      .catch(() => {
        if (!cancelled) {
          setFieldsByType((prev) => ({ ...prev, [currentItemType]: [] }));
          setCreatorTypesByType((prev) => ({ ...prev, [currentItemType]: [] }));
        }
      })
      .finally(() => {
        if (!cancelled) setFieldsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItemType]);

  useEffect(() => setTitleDraft(null), [selectedItems.length === 1 ? selectedItems[0].key : null]);

  if (selectedItems.length === 0) {
    return (
      <aside className="item-details item-details--empty">
        <p>Select an item to see its details.</p>
      </aside>
    );
  }

  if (selectedItems.length > 1) {
    return (
      <aside className="item-details">
        <h2 className="item-details__title">{selectedItems.length} items selected</h2>
        <ul className="item-details__multi-list">
          {selectedItems.map((item) => {
            const Icon = getItemTypeIcon(item.data.itemType);
            return (
              <li key={item.key}>
                <Icon size={13} className={getItemTypeColorClass(item.data.itemType)} /> {String(item.data.title ?? '(untitled)')}
              </li>
            );
          })}
        </ul>
      </aside>
    );
  }

  const item = selectedItems[0];
  const { data } = item;
  const Icon = getItemTypeIcon(data.itemType);
  const noteCount = allItems.filter((i) => i.data.parentItem === item.key && i.data.itemType === 'note').length;
  const attachmentCount = allItems.filter((i) => i.data.parentItem === item.key && i.data.itemType === 'attachment').length;
  const fields = fieldsByType[data.itemType] ?? [];
  const creatorTypes = creatorTypesByType[data.itemType] ?? [];
  const supportsCreators = data.itemType !== 'note' && data.itemType !== 'attachment';
  const creatorCount = (data.creators ?? []).length;
  const effectiveTab = tab === 'creators' && !supportsCreators ? 'info' : tab;

  const commitTitle = () => {
    if (titleDraft === null) return;
    const original = String(data.title ?? '');
    if (titleDraft !== original) onUpdateField(item.key, 'title', titleDraft);
  };

  return (
    <aside className="item-details">
      <div className="item-details__heading">
        <Icon size={18} className={getItemTypeColorClass(data.itemType)} />
        <input
          type="text"
          className="item-details__title-input"
          value={titleDraft ?? String(data.title ?? '')}
          placeholder="(untitled)"
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </div>
      <span className="item-details__type">{data.itemType}</span>

      <div className="item-details__tabs">
        <button type="button" className={effectiveTab === 'info' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'} onClick={() => setTab('info')}>
          Info
        </button>
        {supportsCreators && (
          <button
            type="button"
            className={effectiveTab === 'creators' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'}
            onClick={() => setTab('creators')}
          >
            Creators {creatorCount ? `(${creatorCount})` : ''}
          </button>
        )}
        <button type="button" className={effectiveTab === 'tags' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'} onClick={() => setTab('tags')}>
          Tags {data.tags?.length ? `(${data.tags.length})` : ''}
        </button>
        <button
          type="button"
          className={effectiveTab === 'collections' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'}
          onClick={() => setTab('collections')}
        >
          Collections
        </button>
        <button type="button" className={effectiveTab === 'notes' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'} onClick={() => setTab('notes')}>
          Notes {noteCount ? `(${noteCount})` : ''}
        </button>
        <button
          type="button"
          className={effectiveTab === 'attachments' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'}
          onClick={() => setTab('attachments')}
        >
          Attachments {attachmentCount ? `(${attachmentCount})` : ''}
        </button>
        <button
          type="button"
          className={effectiveTab === 'related' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'}
          onClick={() => setTab('related')}
        >
          Related
        </button>
      </div>

      <div className="item-details__tab-panel">
        {effectiveTab === 'info' && (
          <InfoTab
            item={item}
            fields={fields}
            fieldsLoading={fieldsLoading && fields.length === 0}
            onUpdateField={(field, value) => onUpdateField(item.key, field, value)}
          />
        )}
        {effectiveTab === 'creators' && supportsCreators && (
          <CreatorEditor item={item} creatorTypes={creatorTypes} onUpdateCreators={(creators) => onUpdateCreators(item.key, creators)} />
        )}
        {effectiveTab === 'tags' && (
          <TagsTab
            item={item}
            onAddTag={(tag) => onAddTag(item.key, tag)}
            onRemoveTag={(tag) => onRemoveTag(item.key, tag)}
            onRenameTag={(oldTag, newTag) => onRenameTag(item.key, oldTag, newTag)}
          />
        )}
        {effectiveTab === 'collections' && (
          <CollectionsTab item={item} collections={collections} onAddToCollection={(collectionKey) => onAddToCollection(collectionKey, [item.key])} />
        )}
        {effectiveTab === 'notes' && (
          <NotesTab
            item={item}
            allItems={allItems}
            onAddNote={(text) => onAddNote(item.key, text)}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
          />
        )}
        {effectiveTab === 'attachments' && (
          <AttachmentsTab
            item={item}
            allItems={allItems}
            onAddAttachment={(file) => onAddAttachment(item.key, file)}
            onDownloadAttachment={onDownloadAttachment}
            onDeleteAttachment={onDeleteAttachment}
          />
        )}
        {effectiveTab === 'related' && <RelatedTab item={item} allItems={allItems} onSelectRelated={onSelectItem} />}
      </div>
    </aside>
  );
}
