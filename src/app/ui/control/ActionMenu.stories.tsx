import preview from '@sb/preview';
import { EllipsisVertical, Link2Off, Pencil, Star } from 'lucide-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { ActionMenu } from './ActionMenu';
import type { ActionMenuItem } from './ActionMenu';

/* Typed rather than inferred: an inline literal widens `tone` to `string`, which makes every story's args unassignable. */
const removeItem: ActionMenuItem = { key: 'remove', label: 'Remove from Dreamrules', tone: 'danger', onSelect: fn() };

const meta = preview.meta({
  component: ActionMenu,
  parameters: { layout: 'centered' },
  args: {
    label: 'Actions for House Atreides',
    icon: <EllipsisVertical size={15} aria-hidden />,
    items: [removeItem],
  },
  argTypes: { icon: { control: false } },
});

/** One destructive choice — the shape a list item's menu usually takes. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Actions for House Atreides' });

    await userEvent.click(trigger);

    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Remove from Dreamrules' })).toBeVisible());
  },
});

/** Several choices, with the destructive one toned apart from the rest. */
export const SeveralChoices = meta.story({
  args: {
    items: [
      { key: 'feature', label: 'Feature on the page', icon: <Star size={15} aria-hidden />, onSelect: fn() },
      { key: 'edit', label: 'Edit this faction', icon: <Pencil size={15} aria-hidden />, onSelect: fn() },
      { ...removeItem, icon: <Link2Off size={15} aria-hidden /> },
    ] satisfies ActionMenuItem[],
  },
});

/** A choice that is present but unavailable stays visible, so its absence is never a mystery. */
export const DisabledChoice = meta.story({
  args: {
    items: [
      { key: 'edit', label: 'Edit this faction', icon: <Pencil size={15} aria-hidden />, onSelect: fn() },
      { ...removeItem, icon: <Link2Off size={15} aria-hidden />, disabled: true },
    ] satisfies ActionMenuItem[],
  },
});

/** The whole trigger disabled — while a write is in flight, for instance. */
export const DisabledTrigger = meta.story({
  args: { disabled: true },
});
