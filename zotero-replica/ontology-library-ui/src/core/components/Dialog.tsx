import { useEffect, useRef } from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Appended to the "dialog" class - e.g. "dialog--wide" for content-heavy dialogs like import preview. */
  className?: string;
}

/**
 * VS Code webviews block window.alert/confirm/prompt, so every confirmation
 * or text-entry in this app needs an in-page dialog - this is that one
 * shared implementation (New Collection name entry, Move to Trash confirm).
 */
export function Dialog({ title, onClose, children, className }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="dialog-overlay"
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={className ? `dialog ${className}` : 'dialog'} role="dialog" aria-modal="true" aria-label={title}>
        <h3 className="dialog__title">{title}</h3>
        {children}
      </div>
    </div>
  );
}
