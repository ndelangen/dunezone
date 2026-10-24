import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';

/*
 * Chapter 7, "Moving pieces", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the band above it giving one task at a time. Its art comes as chapter 5's does; see that story.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Moving pieces',
  args: { path: '/tutorial/moving-pieces' },
  /* Shown with motion on whatever the viewing machine prefers (Norbert, 2026-10-23: demos play the motion), so the end's confetti flies. */
  globals: { motion: 'on' },
});

/** The chapter as a player meets it: do what the band says, where the pointer shows, and it moves on by itself. */
export const Chapter = meta.story({
  /*
   * Not captured: under Chromatic's software GL the table takes longer to settle than its 15 s capture limit,
   * and a 3D table drawn that way is no stable picture. The story test runner still plays it through.
   */
  parameters: { chromatic: { disableSnapshot: true } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const band = await page.findByRole('banner', { name: 'Chapter 7: Moving pieces' }, { timeout: 60_000 });
    await expect(await within(band).findByText('Split three troops off', {}, { timeout: 60_000 })).toBeVisible();
    await expect(within(band).queryByRole('button', { name: 'Next' })).toBeNull();
    /* The band grows its arrow, a curve-cornered wedge in its outline, once the table has drawn. */
    await waitFor(
      async () => {
        const outline = canvasElement.ownerDocument.querySelector('[data-tutorial-pointer]')!;
        await expect(outline.getAttribute('d') ?? '').toContain('Q');
      },
      { timeout: 60_000 }
    );
  },
});
