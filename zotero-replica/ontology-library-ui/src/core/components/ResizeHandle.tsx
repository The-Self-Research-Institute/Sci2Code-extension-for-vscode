import { useRef, useState } from 'react';

interface ResizeHandleProps {
  /** Called on every pointer move with the horizontal delta since the last event. */
  onDrag: (deltaX: number) => void;
  /** Called once the drag ends - the point to persist the final width. */
  onDragEnd: () => void;
}

/**
 * A thin draggable divider between two panes. Uses pointer capture so the
 * drag keeps tracking even if the cursor leaves the handle's own bounds
 * (professional-app feel - no jitter, no losing the drag mid-motion).
 * Visible bar is 2px; the hit area is wider (see .pane-resizer in App.css).
 */
export function ResizeHandle({ onDrag, onDragEnd }: ResizeHandleProps) {
  const [active, setActive] = useState(false);
  const lastX = useRef(0);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    lastX.current = event.clientX;
    setActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-col');
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const delta = event.clientX - lastX.current;
    lastX.current = event.clientX;
    if (delta !== 0) onDrag(delta);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    setActive(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove('resizing-col');
    onDragEnd();
  };

  return (
    <div
      className={active ? 'pane-resizer pane-resizer--active' : 'pane-resizer'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
