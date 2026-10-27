import { Button } from '@mantine/core';
import { testingPreview } from '@sb/preview';
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
    withTable: false,
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
  await userEvent.keyboard('{Enter}');
  await expect(await page.findByRole('dialog', {}, { timeout: 10_000 })).toBeVisible();
  await expect(document.querySelector('[data-chapter-confetti]')).not.toBeNull();
  await expect(page.getByRole('button', { name: 'A button on the page' }).closest('[inert]')).not.toBeNull();
  return page;
}

/* With the end closed, nothing of it is left, and the page answers again. */
async function expectPageBack(canvasElement: HTMLElement) {
  const document = canvasElement.ownerDocument;
  const page = within(document.body);
  await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
  await expect(document.querySelector('[data-chapter-confetti]')).toBeNull();
  const button = page.getByRole('button', { name: 'A button on the page' });
  await expect(button.closest('[inert]')).toBeNull();
  await userEvent.click(button);
}

/** Keep playing closes the end and hands the page back, confetti and all. */
export const KeepPlayingByClick = meta.story({
  play: async ({ canvasElement }) => {
    const page = await endChapter(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Keep playing' }, { timeout: 10_000 }));
    await expectPageBack(canvasElement);
  },
});

/** Escape does the same as Keep playing. */
export const KeepPlayingByEscape = meta.story({
  play: async ({ canvasElement }) => {
    await endChapter(canvasElement);
    await userEvent.keyboard('{Escape}');
    await expectPageBack(canvasElement);
  },
});
