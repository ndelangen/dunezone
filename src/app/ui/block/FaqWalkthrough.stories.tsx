import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { Surface } from '../surface';
import { FaqWalkthrough } from './FaqWalkthrough';
import type { FaqWalkthroughProps } from './FaqWalkthrough';

const exchange: FaqWalkthroughProps = {
  asker: 'Chani',
  question: 'Can I ship troops into the storm?',
  answers: [
    { author: 'Stilgar', text: 'No. Shipment into a territory under the storm is never allowed.' },
    {
      author: 'Liet',
      text: 'The storm blocks shipment and movement into it, and troops already there are lost when it moves over them.',
    },
    { author: 'Jessica', text: 'Unless your faction has an advantage that says otherwise. Check your sheet.' },
  ],
  accepted: 1,
};

const meta = preview.meta({
  component: FaqWalkthrough,
  parameters: { layout: 'padded' },
  args: exchange,
  /* On the pane a page gives it, as the block paints nothing of its own. */
  render: (args: FaqWalkthroughProps) => (
    <Surface padding="lg">
      <FaqWalkthrough {...args} />
    </Surface>
  ),
});

/** The loop: the question types out, the replies arrive, the pointer accepts one. The reader can hold it. */
export const Animated = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Can I ship troops into the storm?')).toBeInTheDocument();
    await expect(canvas.getByText('Accepted answer')).toBeInTheDocument();
    const reply = canvas.getByText(exchange.answers[0]!.text).closest('li')!;
    await expect(getComputedStyle(reply).animationPlayState).toBe('running');
    /* One name throughout, with the pressed state saying whether it holds. */
    const pause = canvas.getByRole('button', { name: 'Pause animation' });
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pause);
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(getComputedStyle(reply).animationPlayState).toBe('paused');
    await userEvent.click(pause);
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect(getComputedStyle(reply).animationPlayState).toBe('running');
  },
});

/** With the site's motion off, the end of the story stands still: every reply in, one of them accepted. */
export const Still = meta.story({
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Accepted answer')).toBeVisible();
    await expect(canvas.getByText(exchange.answers[2]!.text)).toBeVisible();
    /* Nothing moves, so there is nothing to pause. */
    await expect(canvas.queryByRole('button', { name: /animation/ })).toBeNull();
  },
});
