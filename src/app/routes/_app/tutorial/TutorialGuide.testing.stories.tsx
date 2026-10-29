import { Button } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { element, pressEnter, task } from './chapterScripts/guideChecks';
import { TutorialGuide } from './TutorialGuide';

/* A plain link stands in for the router's in a story. */
const link =
  (href: string) =>
  ({ children, ...rest }: { children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );

/*
 * A one-task chapter round a page with one button, so the end of a chapter can be played without a table:
 * pressing Enter ends it, and the end's card, its veil and its confetti come up over the page.
 */
const meta = testingPreview.meta({
  component: TutorialGuide,
  title: 'Tutorial/Guide',
  parameters: { layout: 'fullscreen' },
  globals: { motion: 'on' },
  args: {
    number: 1,
    title: 'A short chapter',
    learned: ['Enter moves a chapter on'],
    tasks: [
      task({
        id: 'enter',
        task: 'Press Enter',
        detail: 'Press {Enter} to end the chapter.',
        anchor: { kind: 'page', element: element('[data-page-button]') },
        ...pressEnter(),
      }),
    ],
    onReset: fn(),
    chaptersLink: link('#chapters'),
    nextLink: link('#next'),
    children: (
      <Button data-page-button m="xl" ml="30rem">
        A button on the page
      </Button>
    ),
  },
});

/* Ends the chapter, then checks that the card, its veil and the confetti cover the page and hold it still. */
async function endChapter(canvasElement: HTMLElement) {
  const document = canvasElement.ownerDocument;
  const page = within(document.body);
  await page.findByRole('banner', { name: /A short chapter/ }, { timeout: 30_000 });
  /*
   * The task starts listening for Enter on the guide's next frame, which a loaded runner can hold back,
   * so Enter is pressed again, a second apart, until the end comes up; never once it has, where Enter would press its button.
   */
  await waitFor(
    async () => {
      if (!page.queryByRole('dialog')) {
        await userEvent.keyboard('{Enter}');
      }
      await expect(page.getByRole('dialog')).toBeVisible();
    },
    { timeout: 20_000, interval: 1000 }
  );
  await expect(document.querySelector('[data-chapter-confetti]')).not.toBeNull();
  await expect(page.getByRole('button', { name: 'A button on the page' }).closest('[inert]')).not.toBeNull();
  return page;
}

/** The completed guide stays readable while the table remains finished. */
export const ReadCompletedStep = meta.story({
  play: async ({ canvasElement }) => {
    const page = await endChapter(canvasElement);
    await expect(page.queryByRole('button', { name: 'Keep playing' })).toBeNull();
    const completed = page.getByRole('button', { name: 'Press Enter (done)' });
    await userEvent.click(completed);
    await expect(completed).toHaveAttribute('aria-expanded', 'true');
    const details = canvasElement.ownerDocument.getElementById(completed.getAttribute('aria-controls')!)!;
    await waitForFrame(() => expect(details).toBeVisible());
    await userEvent.keyboard('{Escape}');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'A button on the page' }).closest('[inert]')).not.toBeNull();
  },
});
