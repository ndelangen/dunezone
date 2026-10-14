import { expect, within } from 'storybook/test';

import { mapViewPoint, settled, waitForPlayCamera } from './playing.stories.fixture';

/** Carries the battle marker to the given board point and checks the resulting command. */
export async function dragBattleMarker(
  document: Document,
  point: readonly [number, number, number],
  placed: () => void
) {
  const page = within(document.body);
  await waitForPlayCamera(document);
  await settled(() => expect(page.getByRole('button', { name: 'Drag battle marker onto territory' })).toBeEnabled());
  const [clientX, clientY] = mapViewPoint(document, point);
  const view = document.defaultView!;
  const marker = page.getByRole('button', { name: 'Drag battle marker onto territory' });
  const pointer = { bubbles: true, cancelable: true, pointerId: 7, button: 0, clientX, clientY };
  /*
   * Cursor style writes wake mutation-driven assertions.
   * Keeping the gesture outside that wait prevents a refused drop from repeating indefinitely between timer ticks.
   */
  marker.dispatchEvent(new PointerEvent('pointerdown', pointer));
  view.dispatchEvent(new PointerEvent('pointermove', pointer));
  view.dispatchEvent(new PointerEvent('pointerup', pointer));
  await settled(placed);
}
