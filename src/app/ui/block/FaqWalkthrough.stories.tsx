import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

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
