import { waitForFrame } from '@sb/storyWaits';
import { expect, within } from 'storybook/test';

import { mapViewPoint, settled, waitForPlayCamera } from './mapView.stories.fixture';

/** Carries the battle marker to the given board point and checks the resulting command. */
export async function dragBattleMarker(
  document: Document,
  point: readonly [number, number, number],
  placed: () => void | Promise<void>
) {
  const page = within(document.body);
  await waitForPlayCamera(document);
  await settled(() => expect(page.getByRole('button', { name: 'Drag battle marker onto territory' })).toBeEnabled());
  const scene = document.querySelector('canvas')!;
  let clientX = 0;
  let clientY = 0;
  /* A projected point must also receive the drop in the browser's drawn layout. */
  await waitForFrame(
    async () => {
      [clientX, clientY] = mapViewPoint(document, point);
      const under = document.elementFromPoint(clientX, clientY);
      await expect(under === scene || Boolean(under?.closest('[data-local-carry]'))).toBe(true);
    },
    { timeout: 30_000 }
  );
  const view = document.defaultView!;
  const marker = page.getByRole('button', { name: 'Drag battle marker onto territory' });
  const handle = marker.getBoundingClientRect();
  const pointer = { bubbles: true, cancelable: true, pointerId: 7, button: 0, clientX, clientY };
  /*
   * Cursor style writes wake mutation-driven assertions.
   * Keeping the gesture outside that wait prevents a refused drop from repeating indefinitely between timer ticks.
   */
  marker.dispatchEvent(
    new PointerEvent('pointerdown', {
      ...pointer,
      buttons: 1,
      clientX: handle.left + handle.width / 2,
      clientY: handle.top + handle.height / 2,
    })
  );
  await settled(() => expect(scene.style.cursor).toBe('grabbing'));
  view.dispatchEvent(new PointerEvent('pointermove', { ...pointer, buttons: 1 }));
  view.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
  await settled(placed);
}
