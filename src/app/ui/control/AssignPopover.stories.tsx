import preview from '@sb/preview';
import { Plus, Users } from 'lucide-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { AssignPopover } from './AssignPopover';

const groups = [
  { value: 'group-1', label: 'Arrakeen Rules Council (arrakeen-rules-council)' },
  { value: 'group-2', label: 'Spice Cartel (spice-cartel)' },
];

const meta = preview.meta({
  component: AssignPopover,
  parameters: { layout: 'centered' },
  args: {
    noun: 'group',
    disabled: false,
    icon: <Users size={17} aria-hidden />,
    options: groups,
    onAssign: fn(async () => undefined),
  },
  argTypes: { icon: { control: false } },
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Assign group' });

    await userEvent.click(trigger);

    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() =>
      expect(page.getByRole('combobox', { name: 'Search groups' })).toBeVisible()
    );
  },
});

/** Every label follows the noun, so the other direction reads correctly without new props. */
export const DifferentNoun = meta.story({
  args: {
    noun: 'faction',
    title: 'Add a faction',
    size: 'sm',
    icon: <Plus size={14} aria-hidden />,
    options: [{ value: 'faction-1', label: 'House Atreides — unassigned' }],
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Add a faction' }));
    await waitFor(() =>
      expect(page.getByRole('combobox', { name: 'Search factions' })).toBeVisible()
    );
  },
});

export const NothingToAssign = meta.story({
  args: { options: [] },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Assign group' }));
    await waitFor(() => expect(page.getByText('No groups are available yet.')).toBeVisible());
  },
});

/** The caller knows a better reason than "none available". */
export const CallerSuppliedEmptyMessage = meta.story({
  args: {
    noun: 'faction',
    options: [],
    emptyMessage: 'All your factions are already in this group.',
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Assign faction' }));
    await waitFor(() =>
      expect(page.getByText('All your factions are already in this group.')).toBeVisible()
    );
  },
});

/** Still fetching the choices. */
export const Loading = meta.story({
  args: { loading: true, options: [] },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Assign group' }));
    await waitFor(() => expect(page.getByText('Loading groups…')).toBeVisible());
  },
});

export const Disabled = meta.story({
  args: { disabled: true },
});
