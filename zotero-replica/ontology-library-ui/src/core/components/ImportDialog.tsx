import { useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { parseImportFile, ImportParseError, type ParsedImportResult, type ImportedRecord, type ImportedCreator } from '../import';
import { findDuplicate, type DuplicateMatch } from '../import/duplicateDetection';
import { mapToItem } from '../import/mapToItem';
import { generateLocalKey } from '../state/localLibraryStore';
import type { Collection, Item } from '../../api/types';

const ACCEPT = '.bib,.bibtex,.ris,.enw,.json,.csljson,.rdf,.xml';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB - large enough for any real bibliography export, small enough to parse synchronously without freezing the UI.

interface PreviewRow {
  index: number;
  record: ImportedRecord;
  duplicate?: DuplicateMatch;
  selected: boolean;
}

export interface ImportSummary {
  items: Item[];
  collections: Collection[];
  importedCount: number;
  skippedDuplicateCount: number;
}

interface ImportDialogProps {
  onClose: () => void;
  existingItems: Item[];
  /** If the user had a collection selected when they clicked Import, offer it as the default destination. */
  currentCollectionKey?: string;
  onConfirm: (summary: ImportSummary) => void;
}

function summarizeCreators(creators: ImportedCreator[]): string {
  if (creators.length === 0) return '—';
  const first = creators[0].lastName ?? creators[0].firstName ?? '—';
  return creators.length > 1 ? `${first} et al.` : first;
}

function extractYear(date?: string): string {
  return date?.match(/\d{4}/)?.[0] ?? '';
}

/**
 * Import → file picker → parse → preview → confirm, per the required UX.
 * Parsing (core/import/*) is entirely local/synchronous - nothing here ever
 * touches the network. Confirming never mutates existing data directly; it
 * hands the caller a plain { items, collections } batch to append (see
 * useLibraryData's importItems), so a cancelled or failed import leaves the
 * library untouched.
 */
export function ImportDialog({ onClose, existingItems, currentCollectionKey, onConfirm }: ImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedImportResult | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [addToCurrentCollection, setAddToCurrentCollection] = useState(!!currentCollectionKey);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`"${file.name}" is too large to import here (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB).`);
      }
      const text = await file.text();
      const result = parseImportFile(file.name, text);
      const newRows: PreviewRow[] = result.records.map((record, index) => {
        const duplicate = findDuplicate(existingItems, record);
        return { index, record, duplicate, selected: !duplicate };
      });
      setParsedResult(result);
      setRows(newRows);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof ImportParseError ? e.message : e instanceof Error ? e.message : 'Could not read this file.');
      setParsedResult(null);
      setRows([]);
      setFileName(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleRow = (index: number) => {
    setRows((prev) => prev.map((r) => (r.index === index ? { ...r, selected: !r.selected } : r)));
  };

  const selectAll = () => setRows((prev) => prev.map((r) => ({ ...r, selected: true })));
  const selectNone = () => setRows((prev) => prev.map((r) => ({ ...r, selected: false })));

  const duplicateCount = rows.filter((r) => r.duplicate).length;
  const selectedCount = rows.filter((r) => r.selected).length;

  const handleConfirm = () => {
    const destinationCollectionKey = addToCurrentCollection ? currentCollectionKey : undefined;
    const selectedRows = rows.filter((r) => r.selected);
    const selectedIndexes = new Set(selectedRows.map((r) => r.index));

    const indexToKey = new Map<number, string>();
    const items: Item[] = selectedRows.map((row) => {
      const item = mapToItem(row.record, { collectionKey: destinationCollectionKey });
      indexToKey.set(row.index, item.key);
      return item;
    });

    const collections: Collection[] = [];
    for (const rdfCollection of parsedResult?.collections ?? []) {
      const memberKeys = rdfCollection.memberIndexes
        .filter((idx) => selectedIndexes.has(idx))
        .map((idx) => indexToKey.get(idx))
        .filter((k): k is string => !!k);
      if (memberKeys.length === 0) continue;

      const collectionKey = generateLocalKey();
      collections.push({
        key: collectionKey,
        version: 1,
        library: { id: 'me', type: 'user' },
        data: { key: collectionKey, version: 1, name: rdfCollection.name, parentCollection: false, relations: {} },
      });
      for (const item of items) {
        if (memberKeys.includes(item.key)) {
          item.data.collections = [...(item.data.collections ?? []), collectionKey];
        }
      }
    }

    onConfirm({
      items,
      collections,
      importedCount: items.length,
      skippedDuplicateCount: rows.filter((r) => r.duplicate && !r.selected).length,
    });
    onClose();
  };

  const isPreview = rows.length > 0 && fileName;

  return (
    <Dialog title="Import Library" onClose={onClose} className={isPreview ? 'dialog--wide' : undefined}>
      {!isPreview && (
        <>
          <p className="dialog__hint">Select a supported bibliographic file.</p>
          <p className="dialog__hint">Supported: BibTeX · RIS · EndNote · CSL JSON · Zotero RDF</p>
          {error && <p className="dialog__hint dialog__hint--error">{error}</p>}
          <input ref={fileInputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleFile(file);
          }} />
          <div className="dialog__actions">
            <button type="button" className="toolbar__button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="toolbar__button toolbar__button--primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {busy ? 'Reading…' : 'Choose File'}
            </button>
          </div>
        </>
      )}

      {isPreview && (
        <>
          <p className="dialog__hint">
            {rows.length} record{rows.length === 1 ? '' : 's'} found in "{fileName}" ({parsedResult?.formatLabel}).
            {duplicateCount > 0 && ` ${duplicateCount} possible duplicate${duplicateCount === 1 ? '' : 's'} (unchecked by default).`}
          </p>
          {currentCollectionKey && (
            <label className="import-preview__checkbox-row">
              <input
                type="checkbox"
                checked={addToCurrentCollection}
                onChange={(e) => setAddToCurrentCollection(e.target.checked)}
              />
              Add imported items to the currently selected collection
            </label>
          )}
          <div className="import-preview__row-actions">
            <button type="button" className="import-preview__link" onClick={selectAll}>
              Select all
            </button>
            <button type="button" className="import-preview__link" onClick={selectNone}>
              Select none
            </button>
          </div>
          <div className="import-preview__table-wrap">
            <table className="import-preview__table">
              <thead>
                <tr>
                  <th />
                  <th>Title</th>
                  <th>Creators</th>
                  <th>Year</th>
                  <th>Type</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.index} className={row.duplicate ? 'import-preview__row--duplicate' : undefined}>
                    <td>
                      <input type="checkbox" checked={row.selected} onChange={() => toggleRow(row.index)} />
                    </td>
                    <td>
                      <div className="import-preview__title-cell">
                        {row.record.title ?? '(untitled)'}
                        {row.duplicate && (
                          <span
                            className="import-preview__dup-badge"
                            title={`${row.duplicate.reason} as "${String(row.duplicate.item.data.title ?? '')}"`}
                          >
                            Duplicate
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{summarizeCreators(row.record.creators)}</td>
                    <td>{extractYear(row.record.date)}</td>
                    <td>{row.record.itemType}</td>
                    <td className="import-preview__tags-cell">{row.record.tags.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dialog__actions">
            <button type="button" className="toolbar__button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="toolbar__button toolbar__button--primary" onClick={handleConfirm} disabled={selectedCount === 0}>
              Import {selectedCount} item{selectedCount === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
