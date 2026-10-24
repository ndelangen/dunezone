import { expect, waitFor, within } from 'storybook/test';

/*
 * What every chapter's story shares: its page shows with motion on whatever the viewing machine prefers
 * (Norbert, 2026-10-23: demos play the motion), so the end's confetti flies, and its play checks the band and its arrow, not the art.
 */
export const chapterGlobals = { motion: 'on' } as const;

/*
 * Not captured: under Chromatic's software GL the table takes longer to settle than its 15 s capture limit,
 * and a 3D table drawn that way is no stable picture. The story test runner still plays it through.
 */
export const chapterParameters = { chromatic: { disableSnapshot: true } } as const;

/** The chapter's band opens on its first task, with no Next button, and grows its arrow once the table has drawn. */
export const playChapter =
  (band: string, firstTask: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const banner = await page.findByRole('banner', { name: band }, { timeout: 60_000 });
    await expect(await within(banner).findByText(firstTask, {}, { timeout: 60_000 })).toBeVisible();
    await expect(within(banner).queryByRole('button', { name: 'Next' })).toBeNull();
    /* The arrow is a curve-cornered wedge in the band's outline. */
    await waitFor(
      async () => {
        const outline = canvasElement.ownerDocument.querySelector('[data-tutorial-pointer]')!;
        await expect(outline.getAttribute('d') ?? '').toContain('Q');
      },
      { timeout: 60_000 }
    );
  };
