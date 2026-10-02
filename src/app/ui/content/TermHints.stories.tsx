import { Button } from '@mantine/core';
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

/** The field's own buttons sit at the end of the note, wrapping under the words when space runs out. */
export const WithActions = meta.story({
  args: {
    actions: (
      <Button size="compact-sm" variant="light">
        Fix wording
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const note = within(canvasElement).getByRole('note', { name: 'Wording suggestions' });
    await expect(within(note).getByRole('button', { name: 'Fix wording' })).toBeVisible();
  },
});

/** Right after a fix the note stays, so the field can offer to take it back. */
export const JustFixed = meta.story({
  args: {
    hints: [],
    fixed: true,
    actions: (
      <Button size="compact-sm" variant="subtle">
        Undo
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Wording fixed.')).toBeVisible();
  },
});
