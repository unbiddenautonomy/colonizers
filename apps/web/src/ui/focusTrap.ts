/** The things inside a dialog a keyboard can land on, in order. */
const CAN_FOCUS =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(CAN_FOCUS)].filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
  );
}

/**
 * Where Tab should go next inside a dialog. Tab used to walk out of a dialog
 * and into the game behind it, which left a keyboard typing into a screen it
 * could not see.
 */
export function wrapTab(count: number, at: number, back: boolean): number {
  if (count <= 0) return -1;
  if (back) return at <= 0 ? count - 1 : at - 1;
  return at >= count - 1 || at < 0 ? 0 : at + 1;
}
