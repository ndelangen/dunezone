/*
 * The 3D table's own focus target: its scene area, focusable from script only.
 * Focus there leaves every key to the table, as when nothing at all has focus, but keeps the page's focus on the table rather than on the page.
 */
const TABLE_FOCUS_ATTRIBUTE = 'data-table-focus';

/** Hands the keyboard back to the table: the scene takes the focus, or, where no table is shown, whatever had it lets go. */
export function focusTable() {
  const scene = document.querySelector<HTMLElement>(`[${TABLE_FOCUS_ATTRIBUTE}]`);
  if (scene) {
    scene.focus({ preventScroll: true });
    return;
  }
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
