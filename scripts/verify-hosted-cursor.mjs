/**
 * The hosted browser flows' reading of the other player's drawn cursor.
 * It is kept apart from the flow script, which runs a flow when imported, so that a test can read a fixture page with it.
 */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

/** The hand `sender`'s cursor draws on `recipient`'s page, beside the sender's name label. */
export function remoteCursor(recipient, sender) {
  return recipient.page
    .getByText(sender.view().viewer.displayName, { exact: true })
    .locator('..')
    .filter({ has: recipient.page.locator('svg') })
    .locator('svg');
}

/* How long the cursor may take to show: Playwright's default for a locator's wait, which the flows do not change. */
const VISIBLE_TIMEOUT_MS = 30_000;

/**
 * The page bounds of the sender's cursor once it is visible, refusing a cursor that it or an ancestor makes fully transparent.
 * Visibility, opacity and bounds come from one page evaluation, so a cursor that fades, moves or expires between two reads is never judged on parts of both (#1343).
 */
export async function cursorBounds(recipient, sender) {
  const hand = remoteCursor(recipient, sender);
  const deadline = Date.now() + VISIBLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const cursors = await hand.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        let transparent = false;
        for (let current = element; current; current = current.parentElement) {
          if (Number(getComputedStyle(current).opacity) === 0) {
            transparent = true;
          }
        }
        /* Playwright's visible state: a box with an area, and neither display nor visibility hides it. */
        const visible = width > 0 && height > 0 && element.checkVisibility({ visibilityProperty: true });
        return { visible, transparent, bounds: { x, y, width, height } };
      })
    );
    assert.ok(cursors.length <= 1, `The remote cursor matched ${cursors.length} elements.`);
    const [cursor] = cursors;
    if (cursor?.visible) {
      assert.ok(!cursor.transparent, 'The remote cursor or one of its ancestors is fully transparent.');
      return cursor.bounds;
    }
    await delay(25);
  }
  throw new Error(`The remote cursor was not visible within ${VISIBLE_TIMEOUT_MS / 1000} s.`);
}
