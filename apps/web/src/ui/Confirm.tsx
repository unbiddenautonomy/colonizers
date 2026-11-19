import { useEffect, useRef, type ReactNode } from 'react';
import { Modal } from './Modal.tsx';

/**
 * A question with two answers, in the game's own style. The browser's
 * `confirm()` box looks nothing like the rest of the app, blocks everything
 * while it is open, and on a phone it is attributed to the site rather than
 * the game.
 */
export function Confirm({
  title,
  children,
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The answer cannot be taken back, so the cancel button leads. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{children}</p>
      <div className="confirm-actions">
        <button type="button" ref={danger ? first : undefined} className="ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          ref={danger ? undefined : first}
          className="primary"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
