import type { ReactNode } from 'react';
import { Modal } from './Modal.tsx';

/**
 * A question with two answers, in the game's own style. The browser's
 * `confirm()` box looks nothing like the rest of the app, blocks everything
 * while it is open, and on a phone it is attributed to the site rather than
 * the game.
 *
 * Cancel comes first, so it is where the keyboard lands (see Modal) and where
 * a thumb reaches first.
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
  /** The answer cannot be taken back: the button that goes on says so. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{children}</p>
      <div className="confirm-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={danger ? 'primary danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
