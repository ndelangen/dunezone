import { waitForFrame } from '@sb/storyWaits';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';

/*
 * What every chapter's story shares: its page shows with motion on whatever the viewing machine prefers
 * (Norbert, 2026-10-23: demos play the motion), so the end's confetti flies, and its play checks the rail and its arrow, not the art.
 */
export const chapterGlobals = { motion: 'on' } as const;

/*
 * Chapter stories live in testing files, so Chromatic never captures them (ADR-0004): under its software GL
 * the table takes longer to settle than its 15 s capture limit, and a 3D table drawn that way is no stable
 * picture. The story test runner still plays them through.
 * A testing meta that sets these replaces the page meta's parameters whole, so they carry the page's layout too.
 */
export const chapterParameters = {
  ...pageStoryMeta.parameters,
  layout: 'fullscreen',
} as const;

/*
 * A wait on the rail while the table is drawing.
 * Every frame the wait delivers renders the table, and on the runner's software GL that render takes longer than the 50 ms the shared wait leaves between frames.
 * So the table's own frames, which its camera has to hold still for 20 of before the first task shows, hardly get a turn: a Mentat recall story spent 24 of its 47 s that way (https://github.com/ndelangen/dunezone/issues/1045#issuecomment-6641337530).
 * A frame a second leaves the table drawing at its own pace.
 * On a page that draws no frames at all the rail still moves on these: the first task shows after the 20 settling frames, about 20 s, and each later task takes two, one to see it done and one to advance after the guide's pause, inside the 60 s bound.
 */
export const waitForRail = <T>(check: () => T | Promise<T>) => waitForFrame(check, { timeout: 60_000, interval: 1000 });

/** The chapter's rail opens on its first task, with no Next button, and grows its arrow once the table has drawn. */
export const playChapter =
  (rail: string, firstTask: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const banner = await page.findByRole('banner', { name: rail }, { timeout: 60_000 });
    await waitForRail(() => expect(within(banner).getByText(firstTask)).toBeVisible());
    await expect(within(banner).queryByRole('button', { name: 'Next' })).toBeNull();
    /* The arrow is a curve-cornered wedge in the rail's outline. */
    await waitForRail(async () => {
      const outline = canvasElement.ownerDocument.querySelector('[data-tutorial-pointer]')!;
      await expect(outline.getAttribute('d') ?? '').toContain('Q');
    });
  };
