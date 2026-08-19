import { useMemo, useState } from 'react';
import type { Tag } from '../../api/types';
import { Tags, ChevronRight, ChevronDown, X, Search } from '../icons';

interface TagSelectorProps {
  tags: Tag[];
  selected: Set<string>;
  onToggle: (tag: string) => void;
  onClear: () => void;
}

/**
 * Bottom-left panel below the collection tree, matching Zotero's tag
 * selector placement. The search box here only filters which tags are
 * *displayed* in this list (client-side substring match on the tag name) -
 * it never touches the item list or the selected-tags filter itself.
 */
export function TagSelector({ tags, selected, onToggle, onClear }: TagSelectorProps) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');

  const visibleTags = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tags;
    return tags.filter((t) => t.tag.toLowerCase().includes(needle));
  }, [tags, query]);

  return (
    <div className="tag-selector">
      <button type="button" className="tag-selector__header" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Tags size={14} className="sidebar__icon" />
        <span>Tags</span>
        {selected.size > 0 && (
          <button
            type="button"
            className="tag-selector__clear"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            title="Clear tag filter"
          >
            <X size={12} />
          </button>
        )}
      </button>
      {open && (
        <>
          <div className="tag-selector__search-wrap">
            <Search size={12} className="tag-selector__search-icon" />
            <input
              type="search"
              className="tag-selector__search"
              placeholder="Filter tags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" className="tag-selector__search-clear" onClick={() => setQuery('')} title="Clear">
                <X size={11} />
              </button>
            )}
          </div>
          <div className="tag-selector__list">
            {tags.length === 0 && <span className="tag-selector__empty">No tags</span>}
            {tags.length > 0 && visibleTags.length === 0 && <span className="tag-selector__empty">No matching tags</span>}
            {visibleTags.map((t) => (
              <button
                key={t.tag}
                type="button"
                className={`tag-selector__pill${selected.has(t.tag) ? ' tag-selector__pill--active' : ''}`}
                onClick={() => onToggle(t.tag)}
              >
                <span className="tag-selector__pill-label">{t.tag}</span>
                <span className="tag-selector__pill-count">{t.meta.numItems}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
