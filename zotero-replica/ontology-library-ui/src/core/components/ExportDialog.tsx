import { useState } from 'react';
import { Dialog } from './Dialog';
import { itemsToBibtex } from '../export/bibtexSerializer';
import { itemsToRis } from '../export/risSerializer';
import { itemsToCslJson } from '../export/csljsonSerializer';
import type { Item } from '../../api/types';

type ExportFormat = 'bibtex' | 'ris' | 'csljson';
type ExportScope = 'selected' | 'view' | 'library';

const FORMAT_OPTIONS: { value: ExportFormat; label: string; extension: string; mimeType: string }[] = [
  { value: 'bibtex', label: 'BibTeX (.bib)', extension: 'bib', mimeType: 'application/x-bibtex' },
  { value: 'ris', label: 'RIS (.ris)', extension: 'ris', mimeType: 'application/x-research-info-systems' },
  { value: 'csljson', label: 'CSL-JSON (.json)', extension: 'json', mimeType: 'application/json' },
];

function serialize(format: ExportFormat, items: Item[]): string {
  switch (format) {
    case 'bibtex':
      return itemsToBibtex(items);
    case 'ris':
      return itemsToRis(items);
    case 'csljson':
      return itemsToCslJson(items);
  }
}

function triggerTextDownload(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface ExportDialogProps {
  selectedItems: Item[];
  visibleItems: Item[];
  libraryItems: Item[];
  onClose: () => void;
}

/**
 * Client-side export - the inverse of core/import/*Parser.ts. No new backend
 * endpoint: the dataserver's existing item-listing endpoints already return
 * everything needed (data/creators/tags), so serialization happens entirely
 * in the browser/webview from data already loaded, then triggers a normal
 * file download via a Blob URL (same technique as attachment downloads).
 */
export function ExportDialog({ selectedItems, visibleItems, libraryItems, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('bibtex');
  const [scope, setScope] = useState<ExportScope>(selectedItems.length > 0 ? 'selected' : 'view');

  const scopedItems = scope === 'selected' ? selectedItems : scope === 'view' ? visibleItems : libraryItems;
  const bibliographicCount = scopedItems.filter((i) => i.data.itemType !== 'note' && i.data.itemType !== 'attachment').length;

  const handleExport = () => {
    const formatOption = FORMAT_OPTIONS.find((f) => f.value === format)!;
    const content = serialize(format, scopedItems);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerTextDownload(content, formatOption.mimeType, `replica-export-${stamp}.${formatOption.extension}`);
    onClose();
  };

  return (
    <Dialog title="Export Library" onClose={onClose}>
      <p className="dialog__hint">Notes and attachments have no bibliographic representation and are always skipped.</p>

      <label className="dialog__field-label" htmlFor="export-scope">
        Scope
      </label>
      <select id="export-scope" className="dialog__input" value={scope} onChange={(e) => setScope(e.target.value as ExportScope)}>
        <option value="selected" disabled={selectedItems.length === 0}>
          Selected items ({selectedItems.length})
        </option>
        <option value="view">Current view ({visibleItems.length})</option>
        <option value="library">Entire library ({libraryItems.length})</option>
      </select>

      <label className="dialog__field-label" htmlFor="export-format">
        Format
      </label>
      <select id="export-format" className="dialog__input" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
        {FORMAT_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <p className="dialog__hint">
        {bibliographicCount} item{bibliographicCount === 1 ? '' : 's'} will be exported.
      </p>

      <div className="dialog__actions">
        <button type="button" className="toolbar__button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="toolbar__button toolbar__button--primary" disabled={bibliographicCount === 0} onClick={handleExport}>
          Export
        </button>
      </div>
    </Dialog>
  );
}
