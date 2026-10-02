import preview from '@sb/preview';
import { distinctTermHints } from '@shared/glossary/hints';
import { expect, within } from 'storybook/test';

import { TermHints } from './TermHints';

const meta = preview.meta({
  component: TermHints,
  parameters: { layout: 'padded' },
  args: { hints: distinctTermHints('Ship your forces before combat begins.') },
});

/** Two avoided words in one draft, each pointing at the glossary entry it should read. */
export const TwoHints = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /^Troop\b/ })).toHaveAttribute('href', '/glossary#troop');
    await expect(canvas.getByRole('link', { name: /^Battle\b/ })).toHaveAttribute('href', '/glossary#battle');
  },
});

/** A draft in the glossary's own words shows nothing at all. */
export const NoHints = meta.story({
  args: { hints: distinctTermHints('Ship your troops before the battle begins.') },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('note')).toBeNull();
  },
});
