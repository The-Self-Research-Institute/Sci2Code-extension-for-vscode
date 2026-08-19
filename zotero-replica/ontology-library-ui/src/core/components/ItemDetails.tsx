import { useState } from 'react';
import type { Collection, Creator, Item } from '../../api/types';
import { getItemTypeIcon, getItemTypeColorClass, Paperclip, Link2, FileText, Plus, X } from '../icons';

interface ItemDetailsProps {
  selectedItems: Item[];
  collections: Collection[];
  /** Full item set (including children) - used to resolve attachments/relations. */
  allItems: Item[];
  onSelectItem: (key: string) => void;
  onAddTag: (itemKey: string, tag: string) => void;
  onRemoveTag: (itemKey: string, tag: string) => void;
  onRenameTag: (itemKey: string, oldTag: string, newTag: string) => void;
}

function formatCreator(creator: Creator): string {
  return [creator.firstName, creator.lastName].filter(Boolean).join(' ') || '—';
}

type Tab = 'info' | 'tags' | 'collections' | 'notes' | 'attachments' | 'related';

function InfoTab({ item }: { item: Item }) {
  const { data } = item;
  const creators = data.creators ?? [];

  return (
    <dl className="item-details__fields">
      <dt>Creators</dt>
      <dd>
        {creators.length > 0 ? (
          <ul className="item-details__creators">
            {creators.map((creator, index) => (
              <li key={index}>
                {formatCreator(creator)} <span className="item-details__creator-role">({creator.creatorType})</span>
              </li>
            ))}
          </ul>
        ) : (
          '—'
        )}
      </dd>

      <dt>Date</dt>
      <dd>{String(data.date ?? '—')}</dd>

      {typeof data.publicationTitle === 'string' && (
        <>
          <dt>Publication</dt>
          <dd>{data.publicationTitle}</dd>
        </>
      )}
      {typeof data.bookTitle === 'string' && (
        <>
          <dt>Book Title</dt>
          <dd>{data.bookTitle}</dd>
        </>
      )}
      {typeof data.DOI === 'string' && (
        <>
          <dt>DOI</dt>
          <dd>{data.DOI}</dd>
        </>
      )}
      {typeof data.url === 'string' && (
        <>
          <dt>URL</dt>
          <dd className="item-details__url">{data.url}</dd>
        </>
      )}
      {typeof data.ISBN === 'string' && (
        <>
          <dt>ISBN</dt>
          <dd>{data.ISBN}</dd>
        </>
      )}
      {typeof data.ISSN === 'string' && (
        <>
          <dt>ISSN</dt>
          <dd>{data.ISSN}</dd>
        </>
      )}
      {typeof data.abstractNote === 'string' && (
        <>
          <dt>Abstract</dt>
          <dd className="item-details__abstract">{data.abstractNote}</dd>
        </>
      )}
    </dl>
  );
}

/**
 * Manual tag management for the selected item. `type: 1` tags (imported or
 * auto-generated - see core/import/autoTags.ts) render with a subdued
 * style and a dashed border so they read as distinct from tags the user
 * typed themselves (type 0/absent) - both can be removed, but only
 * renaming/adding goes through here rather than the import pipeline.
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

function CollectionsTab({ item, collections }: { item: Item; collections: Collection[] }) {
  const memberOf = collections.filter((c) => item.data.collections?.includes(c.key));
  if (memberOf.length === 0) return <p className="item-details__empty-tab">Not in any collection.</p>;
  return (
    <ul className="item-details__collection-list">
      {memberOf.map((c) => (
        <li key={c.key}>{c.data.name}</li>
      ))}
    </ul>
  );
}

/**
 * Dataserver's `note` schema currently has an empty field list (see the
 * Phase 1 audit), so a note's actual content can never round-trip - showing
 * a fake note list here would misrepresent a backend capability that
 * doesn't work. This tab is a deliberate placeholder, not a bug.
 */
function NotesTab() {
  return (
    <div className="item-details__unavailable">
      <FileText size={20} />
      <p>Notes require Dataserver support.</p>
      <p className="item-details__unavailable-hint">
        The Dataserver's note item type currently has no usable content field - see the Phase 1 audit.
      </p>
    </div>
  );
}

function AttachmentsTab({ item, allItems }: { item: Item; allItems: Item[] }) {
  const children = allItems.filter((i) => i.data.parentItem === item.key && i.data.itemType === 'attachment');
  if (children.length === 0) {
    return <p className="item-details__empty-tab">No attachments.</p>;
  }
  return (
    <ul className="item-details__attachment-list">
      {children.map((att) => (
        <li key={att.key}>
          <Paperclip size={13} className="item-icon--attachment" />
          <span className="item-details__attachment-name">{String(att.data.filename ?? att.data.title ?? att.key)}</span>
          {typeof att.data.contentType === 'string' && <span className="item-details__attachment-meta">{att.data.contentType}</span>}
        </li>
      ))}
    </ul>
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

export function ItemDetails({ selectedItems, collections, allItems, onSelectItem, onAddTag, onRemoveTag, onRenameTag }: ItemDetailsProps) {
  const [tab, setTab] = useState<Tab>('info');

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

  return (
    <aside className="item-details">
      <div className="item-details__heading">
        <Icon size={18} className={getItemTypeColorClass(data.itemType)} />
        <h2 className="item-details__title">{String(data.title ?? '(untitled)')}</h2>
      </div>
      <span className="item-details__type">{data.itemType}</span>

      <div className="item-details__tabs">
        <button type="button" className={tab === 'info' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'} onClick={() => setTab('info')}>
          Info
        </button>
        <button type="button" className={tab === 'tags' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'} onClick={() => setTab('tags')}>
          Tags {data.tags?.length ? `(${data.tags.length})` : ''}
        </button>
        <button
          type="button"
          className={tab === 'collections' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'}
          onClick={() => setTab('collections')}
        >
          Collections
        </button>
        <button type="button" className={tab === 'notes' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'} onClick={() => setTab('notes')}>
          Notes
        </button>
        <button
          type="button"
          className={tab === 'attachments' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'}
          onClick={() => setTab('attachments')}
        >
          Attachments
        </button>
        <button
          type="button"
          className={tab === 'related' ? 'item-details__tab item-details__tab--active' : 'item-details__tab'}
          onClick={() => setTab('related')}
        >
          Related
        </button>
      </div>

      <div className="item-details__tab-panel">
        {tab === 'info' && <InfoTab item={item} />}
        {tab === 'tags' && (
          <TagsTab
            item={item}
            onAddTag={(tag) => onAddTag(item.key, tag)}
            onRemoveTag={(tag) => onRemoveTag(item.key, tag)}
            onRenameTag={(oldTag, newTag) => onRenameTag(item.key, oldTag, newTag)}
          />
        )}
        {tab === 'collections' && <CollectionsTab item={item} collections={collections} />}
        {tab === 'notes' && <NotesTab />}
        {tab === 'attachments' && <AttachmentsTab item={item} allItems={allItems} />}
        {tab === 'related' && <RelatedTab item={item} allItems={allItems} onSelectRelated={onSelectItem} />}
      </div>
    </aside>
  );
}
