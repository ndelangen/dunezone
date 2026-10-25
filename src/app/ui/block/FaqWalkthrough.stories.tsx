import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { FaqWalkthrough } from './FaqWalkthrough';
import { exchange } from './FaqWalkthrough.stories.fixture';

const meta = preview.meta({
  component: FaqWalkthrough,
  parameters: { layout: 'padded' },
  args: exchange,
});

/** With the site's motion off, the end of the story stands still: every reply in, one of them accepted. */
export const Still = meta.story({
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Accepted answer')).toBeVisible();
    const rows = canvas.getAllByRole('listitem');
    await expect(rows.find((row) => row.textContent?.includes('Liet'))!.getBoundingClientRect().top).toBeLessThan(
      rows[0]!.getBoundingClientRect().top
    );
    await expect(canvas.getByText('Accepted by Chani just now')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Accept answer' })).toBeNull();
    await expect(canvas.getByText(exchange.answers[2]!.text)).toBeVisible();
    /* Nothing moves, so there is nothing to pause. */
    await expect(canvas.queryByRole('button', { name: /animation/ })).toBeNull();
  },
});

export const Phone = meta.story({ globals: { motion: 'reduce', viewport: { value: 'appMobileNarrow' } } });

/** The natural clock must keep replies aligned without seeking their timelines. */
export const NaturalSpacing = meta.story({
  globals: { motion: 'on' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole('list', { name: 'Example answers' });
    const stage = list.parentElement!;
    await waitFor(
      async () => {
        const progress = stage.getAnimations()[0]!.effect!.getComputedTiming().progress!;
        await expect(progress).toBeGreaterThan(0.68);
        await expect(progress).toBeLessThan(0.74);
      },
      { timeout: 20_000 }
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Pause animation' }));
    const first = canvas.getByRole('article', { name: "Stilgar's example answer" }).getBoundingClientRect();
    const second = canvas.getByRole('article', { name: "Liet's example answer" }).getBoundingClientRect();
    const third = canvas.getByRole('article', { name: "Jessica's example answer" }).getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(list).rowGap);
    await expect(second.top - first.bottom).toBeCloseTo(gap, 0);
    await expect(third.top - second.bottom).toBeCloseTo(gap, 0);
  },
});
