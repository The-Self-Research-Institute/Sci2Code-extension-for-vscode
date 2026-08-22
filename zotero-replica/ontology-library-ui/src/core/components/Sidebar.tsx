import { useState, type KeyboardEvent } from 'react';
import type { Collection, Group, Item } from '../../api/types';
import { Library, Users, Folder, FolderOpen, Trash2, ChevronRight, ChevronDown, Pencil } from '../icons';

export type SidebarSelection =
  | { type: 'library' }
  | { type: 'trash' }
  | { type: 'collection'; key: string }
  | { type: 'group'; id: number };

interface SidebarProps {
  collections: Collection[];
  groups: Group[];
  items: Item[];
  selection: SidebarSelection;
  onSelect: (selection: SidebarSelection) => void;
  onRequestRenameCollection: (key: string, currentName: string) => void;
  onRequestDeleteCollection: (key: string) => void;
}

function collectionItemCount(items: Item[], key: string): number {
  return items.filter((it) => !it.data.deleted && it.data.collections?.includes(key)).length;
}

/**
 * These rows were plain `<li onClick>` - unreachable by keyboard at all (no
 * tabIndex, no Enter/Space activation), so a keyboard-only user could never
 * switch between My Library/a collection/Trash/a group. Space is prevented
 * here specifically because without it the page would also scroll on every
 * activation, which native buttons suppress automatically but a plain `<li>`
 * with role="button" does not get for free.
 */
function handleActivateKeyDown(e: KeyboardEvent, onActivate: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onActivate();
  }
}

function CollectionNode({
  collection,
  depth,
  collections,
  items,
  selection,
  onSelect,
  expanded,
  onToggleExpand,
  onRequestRenameCollection,
  onRequestDeleteCollection,
}: {
  collection: Collection;
  depth: number;
  collections: Collection[];
  items: Item[];
  selection: SidebarSelection;
  onSelect: (selection: SidebarSelection) => void;
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  onRequestRenameCollection: (key: string, currentName: string) => void;
  onRequestDeleteCollection: (key: string) => void;
}) {
  const children = collections.filter((c) => c.data.parentCollection === collection.key);
  const isSelected = selection.type === 'collection' && selection.key === collection.key;
  const isOpen = expanded.has(collection.key);
  const hasChildren = children.length > 0;

  return (
    <>
      <li
        className={`sidebar__item sidebar__item--collection${isSelected ? ' sidebar__item--active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        tabIndex={0}
        role="button"
        aria-pressed={isSelected}
        onClick={() => onSelect({ type: 'collection', key: collection.key })}
        onKeyDown={(e) => handleActivateKeyDown(e, () => onSelect({ type: 'collection', key: collection.key }))}
      >
        <span
          className="sidebar__disclosure"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(collection.key);
          }}
        >
          {hasChildren ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        {isOpen ? (
          <FolderOpen size={15} className="sidebar__icon sidebar__icon--folder" />
        ) : (
          <Folder size={15} className="sidebar__icon sidebar__icon--folder" />
        )}
        <span className="sidebar__label">{collection.data.name}</span>
        <span className="sidebar__count">{collectionItemCount(items, collection.key)}</span>
        <span className="sidebar__collection-actions">
          <button
            type="button"
            className="sidebar__collection-action"
            title="Rename collection"
            aria-label={`Rename ${collection.data.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onRequestRenameCollection(collection.key, collection.data.name);
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            className="sidebar__collection-action sidebar__collection-action--delete"
            title="Delete collection"
            aria-label={`Delete ${collection.data.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onRequestDeleteCollection(collection.key);
            }}
          >
            <Trash2 size={13} />
          </button>
        </span>
      </li>
      {hasChildren && isOpen &&
        children.map((child) => (
          <CollectionNode
            key={child.key}
            collection={child}
            depth={depth + 1}
            collections={collections}
            items={items}
            selection={selection}
            onSelect={onSelect}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onRequestRenameCollection={onRequestRenameCollection}
            onRequestDeleteCollection={onRequestDeleteCollection}
          />
        ))}
    </>
  );
}

export function Sidebar({
  collections,
  groups,
  items,
  selection,
  onSelect,
  onRequestRenameCollection,
  onRequestDeleteCollection,
}: SidebarProps) {
  const topLevel = collections.filter((c) => c.data.parentCollection === false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(collections.map((c) => c.key)));

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const myLibraryCount = items.filter((it) => !it.data.deleted && it.library.type === 'user').length;
  const trashCount = items.filter((it) => it.data.deleted).length;

  return (
    <nav className="sidebar">
      <ul className="sidebar__section">
        <li
          className={`sidebar__item sidebar__item--library${selection.type === 'library' ? ' sidebar__item--active' : ''}`}
          tabIndex={0}
          role="button"
          aria-pressed={selection.type === 'library'}
          onClick={() => onSelect({ type: 'library' })}
          onKeyDown={(e) => handleActivateKeyDown(e, () => onSelect({ type: 'library' }))}
        >
          <span className="sidebar__disclosure" />
          <Library size={15} className="sidebar__icon sidebar__icon--library" />
          <span className="sidebar__label">My Library</span>
          <span className="sidebar__count">{myLibraryCount}</span>
        </li>
      </ul>

      {groups.length > 0 && (
        <>
          <div className="sidebar__heading">Group Libraries</div>
          <ul className="sidebar__section">
            {groups.map((group) => {
              const count = items.filter((it) => !it.data.deleted && it.library.type === 'group' && it.library.id === group.id).length;
              return (
                <li
                  key={group.id}
                  className={`sidebar__item${selection.type === 'group' && selection.id === group.id ? ' sidebar__item--active' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selection.type === 'group' && selection.id === group.id}
                  onClick={() => onSelect({ type: 'group', id: group.id })}
                  onKeyDown={(e) => handleActivateKeyDown(e, () => onSelect({ type: 'group', id: group.id }))}
                >
                  <span className="sidebar__disclosure" />
                  <Users size={15} className="sidebar__icon sidebar__icon--group" />
                  <span className="sidebar__label">{group.name}</span>
                  <span className="sidebar__count">{count}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="sidebar__heading">Collections</div>
      <ul className="sidebar__section">
        {topLevel.map((collection) => (
          <CollectionNode
            key={collection.key}
            collection={collection}
            depth={0}
            collections={collections}
            items={items}
            selection={selection}
            onSelect={onSelect}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            onRequestRenameCollection={onRequestRenameCollection}
            onRequestDeleteCollection={onRequestDeleteCollection}
          />
        ))}
        {topLevel.length === 0 && <li className="sidebar__empty">No collections</li>}
      </ul>

      <ul className="sidebar__section sidebar__section--footer">
        <li
          className={`sidebar__item${selection.type === 'trash' ? ' sidebar__item--active' : ''}`}
          tabIndex={0}
          role="button"
          aria-pressed={selection.type === 'trash'}
          onClick={() => onSelect({ type: 'trash' })}
          onKeyDown={(e) => handleActivateKeyDown(e, () => onSelect({ type: 'trash' }))}
        >
          <span className="sidebar__disclosure" />
          <Trash2 size={15} className="sidebar__icon sidebar__icon--trash" />
          <span className="sidebar__label">Trash</span>
          <span className="sidebar__count">{trashCount}</span>
        </li>
      </ul>
    </nav>
  );
}
