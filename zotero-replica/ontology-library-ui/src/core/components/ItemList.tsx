import type { Item } from '../../api/types';
import { getItemTypeIcon, getItemTypeColorClass, Paperclip, ArrowUp, ArrowDown } from '../icons';
import type { ColumnVisibility } from './Toolbar';

export type SortField = 'title' | 'creator' | 'date' | 'itemType';

interface ItemListProps {
  items: Item[];
  /** Full item set (including attachment children) - used only to count attachments per row. */
  allItems: Item[];
  selectedKeys: Set<string>;
  onRowClick: (key: string, index: number, modifiers: { shiftKey: boolean; ctrlOrMeta: boolean }) => void;
  sortField: SortField;
  sortDirection: 'asc' | 'desc';
  onSort: (field: SortField) => void;
  columns: ColumnVisibility;
}

function creatorSummary(item: Item): string {
  const creators = item.data.creators ?? [];
  if (creators.length === 0) return '—';
  const first = creators[0].lastName ?? creators[0].firstName ?? '—';
  return creators.length > 1 ? `${first} et al.` : first;
}

function SortableHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDirection: 'asc' | 'desc';
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sortField === field;
  return (
    <th className={className} onClick={() => onSort(field)}>
      <span className="item-list__header-label">
        {label}
        {active && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );
}

export function ItemList({ items, allItems, selectedKeys, onRowClick, sortField, sortDirection, onSort, columns }: ItemListProps) {
  const visibleColumnCount = 2 + Number(columns.creator) + Number(columns.date) + Number(columns.itemType);

  return (
    <table className="item-list">
      <thead>
        <tr>
          <th className="item-list__col-icon" />
          <SortableHeader label="Title" field="title" sortField={sortField} sortDirection={sortDirection} onSort={onSort} className="item-list__col-title" />
          {columns.creator && (
            <SortableHeader label="Creator" field="creator" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          )}
          {columns.date && <SortableHeader label="Date" field="date" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />}
          {columns.itemType && (
            <SortableHeader label="Type" field="itemType" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          )}
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => {
          const Icon = getItemTypeIcon(item.data.itemType);
          const isSelected = selectedKeys.has(item.key);
          const attachmentCount = allItems.filter((i) => i.data.parentItem === item.key && i.data.itemType === 'attachment').length;
          return (
            <tr
              key={item.key}
              className={isSelected ? 'item-list__row item-list__row--selected' : 'item-list__row'}
              onClick={(e) => onRowClick(item.key, index, { shiftKey: e.shiftKey, ctrlOrMeta: e.ctrlKey || e.metaKey })}
            >
              <td className="item-list__col-icon" title={item.data.itemType}>
                <Icon size={15} className={getItemTypeColorClass(item.data.itemType)} />
              </td>
              <td className="item-list__col-title">
                {String(item.data.title ?? '(untitled)')}
                {attachmentCount > 0 && (
                  <span className="item-list__attachment-badge" title={`${attachmentCount} attachment(s)`}>
                    <Paperclip size={11} /> {attachmentCount}
                  </span>
                )}
              </td>
              {columns.creator && <td>{creatorSummary(item)}</td>}
              {columns.date && <td>{String(item.data.date ?? '')}</td>}
              {columns.itemType && <td>{item.data.itemType}</td>}
            </tr>
          );
        })}
        {items.length === 0 && (
          <tr>
            <td colSpan={visibleColumnCount} className="item-list__empty">
              No items
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
