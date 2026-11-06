import { Stack } from '@mantine/core';
import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SelectableRow } from './SelectableRow';

const meta = preview.meta({
  component: SelectableRow,
  parameters: { layout: 'padded' },
  args: { children: 'Paul Atreides', onSelect: fn() },
});

/** A choice in a picker that closes on a pick: no pressed state. */
export const Choice = meta.story({
  play: async ({ canvasElement, args }) => {
    const row = within(canvasElement).getByRole('button', { name: 'Paul Atreides' });
    await expect(row).not.toHaveAttribute('aria-pressed');
    await userEvent.click(row);
    await expect(args.onSelect).toHaveBeenCalledOnce();
  },
});

/** The item an editor is working on. */
export const Selected = meta.story({
  args: { selected: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Paul Atreides' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  },
});

/** A long name wraps inside the row instead of running past it. */
export const LongName = meta.story({
  render: (args) => (
    <Stack w={220} gap={0}>
      <SelectableRow {...args}>3. The Kwisatz Haderach, foreseen by the Bene Gesserit breeding program</SelectableRow>
    </Stack>
  ),
});
