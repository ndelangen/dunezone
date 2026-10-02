import preview from '@sb/preview';
import { distinctTermHints } from '@shared/glossary/hints';
import { expect, fn, userEvent, within } from 'storybook/test';

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
    await expect(canvas.getByRole('link', { name: /^troop\b/ })).toHaveAttribute('href', '/glossary#troop');
    await expect(canvas.getByRole('link', { name: /^battle\b/ })).toHaveAttribute('href', '/glossary#battle');
  },
});

/** A draft in the glossary's own words shows nothing at all. */
export const NoHints = meta.story({
  args: { hints: distinctTermHints('Ship your troops before the battle begins.') },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('note')).toBeNull();
  },
});

/** With a fix on offer, the callout carries a button that rewrites the draft. */
export const Fixable = meta.story({
  args: { onFix: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Fix wording' }));
    await expect(args.onFix).toHaveBeenCalledOnce();
  },
});

/** Right after a fix the callout stays, so the author can take it back. */
export const JustFixed = meta.story({
  args: { hints: [], onUndo: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Wording fixed.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Undo' })).toBeVisible();
  },
});
