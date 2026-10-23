import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';

/*
 * Chapter 5, "What goes where", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the band above it giving one task at a time. Its art is the site's `/published/...` images, which Storybook serves
 * from the copy `bun run tutorial:mirror` makes; without that copy the table shows blank cards and tokens.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/What goes where',
  args: { path: '/tutorial/what-goes-where' },
  /* Shown with motion on whatever the viewing machine prefers (Norbert, 2026-10-23: demos play the motion), so the end's confetti flies. */
  globals: { motion: 'on' },
});

/** The chapter as a player meets it: do what the band says, where the pointer shows, and it moves on by itself. */
export const Chapter = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const band = await page.findByRole('banner', { name: 'Chapter 5: What goes where' }, { timeout: 60_000 });
    await expect(await within(band).findByText('Look closer at Arrakis', {}, { timeout: 60_000 })).toBeVisible();
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
