import { useEffect, useRef, type ReactNode } from 'react';
import { focusables, wrapTab } from './focusTrap.ts';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A dialog takes the keyboard when it opens, keeps Tab inside it, and hands
  // the keyboard back to whatever opened it. Without this, Tab walked out
  // into the game behind the dialog and nothing said where it had gone.
  useEffect(() => {
    const dialog = box.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.contains(before)) {
      const inside = focusables(dialog);
      // Not the ✕ in the corner: the first thing the dialog is really for.
      (inside.find((el) => !el.classList.contains('icon')) ?? inside[0] ?? dialog).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables(dialog);
      const to = wrapTab(
        list.length,
        list.indexOf(document.activeElement as HTMLElement),
        e.shiftKey,
      );
      if (to < 0) return;
      e.preventDefault();
      list[to]!.focus();
    };
    dialog.addEventListener('keydown', onKey);
    return () => {
      dialog.removeEventListener('keydown', onKey);
      if (before && document.body.contains(before)) before.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={box}
        className={`modal${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
