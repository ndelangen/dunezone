import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, spyOn, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { mapViewPoint, waitForPlayCamera } from '../play/mapView.stories.fixture';
import { chapterGlobals, chapterParameters } from './chapterStory';
import { hmsPublished } from './hms.stories.fixture';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Bring your own pieces',
  args: { path: '/tutorial/bring-your-own-pieces' },
  globals: chapterGlobals,
  parameters: { ...chapterParameters, database: hmsPublished },
});

/** Find the published HMS, request it, and put the approved token on the table. */
export const RequestHMS = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const step = (name: string) =>
      waitForFrame(() => expect(document.querySelector('[data-state="current"]')?.textContent).toContain(name), {
        timeout: 60_000,
      });
    const drag = async (button: HTMLElement) => {
      await waitForPlayCamera(document);
      const canvas = document.querySelector('canvas')!;
      const capture = spyOn(canvas, 'setPointerCapture').mockImplementation(() => {});
      const [clientX, clientY] = mapViewPoint(document, [0, 0, 0]);
      const start = button.getBoundingClientRect();
      const pointer = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0 };
      button.dispatchEvent(
        new PointerEvent('pointerdown', {
          ...pointer,
          buttons: 1,
          clientX: start.left + start.width / 2,
          clientY: start.top + start.height / 2,
        })
      );
      await waitForFrame(() => expect(canvas.style.cursor).toBe('grabbing'));
      window.dispatchEvent(new PointerEvent('pointermove', { ...pointer, buttons: 1, clientX, clientY }));
      window.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, clientX, clientY }));
      capture.mockRestore();
    };
    await step('Open the shared inventory');
    await userEvent.keyboard(' ');
    const search = await page.findByRole('textbox', { name: 'Search controls' });
    await userEvent.type(search, 'Shared');
    await userEvent.keyboard('{Enter}');
    await step('Put a piece on the table');
    await drag(await page.findByRole('button', { name: /Drag Supplies/ }));
    await step('Find HMS in the catalogue');
    await userEvent.click(page.getByRole('button', { name: 'Add pointer tokens from the catalogue' }));
    const catalogue = page.getByLabelText('Search the catalogue');
    await userEvent.type(catalogue, 'HMS');
    await waitForFrame(
      () =>
        expect(page.getByRole('option', { name: /HMS/ }).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false'),
      { timeout: 30_000 }
    );
    await userEvent.click(page.getByRole('option', { name: /HMS/ }));
    await step('Request the piece');
    await userEvent.click(page.getByRole('button', { name: 'Request' }));
    await step('Wait for approval');
    await step('Put HMS on the table');
    const hms = await page.findByRole('button', { name: /Drag HMS/ });
    await waitForFrame(() => expect(hms.querySelector('img')?.naturalWidth ?? 0).toBeGreaterThan(0));
    await drag(hms);
    await waitForFrame(
      () => expect(document.querySelector('[data-state="current"]')?.textContent).not.toContain('Put HMS on the table'),
      { timeout: 120_000 }
    );
  },
});
