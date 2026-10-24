import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';

/*
 * The play-test chapter "New controls", as its page serves it: the tutorial's table with the stage 4 controls
 * (the compass on Space, two pinned slots, the chats beside Controls) and the band teaching them one task at a time.
 * Its art is the site's live `/published/...` images, as in the other chapters: blank in a local Storybook without `bun run tutorial:mirror`.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/New controls',
  args: { path: '/tutorial/new-controls' },
  /* Demos play the motion whatever the viewing machine prefers (Norbert, 2026-10-23), so the slots' bounce and the confetti show. */
  globals: { motion: 'on' },
});

/** The chapter as a tester meets it: do what the band says with the new controls, and it moves on by itself. */
export const Chapter = meta.story({
  /* Not captured, like the other chapters: the 3D table outlasts Chromatic's capture limit under software GL. */
  parameters: { chromatic: { disableSnapshot: true } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const band = await page.findByRole('banner', { name: 'Play-test: New controls' }, { timeout: 60_000 });
    await expect(await within(band).findByText('Open the controls', {}, { timeout: 60_000 })).toBeVisible();
  },
});
