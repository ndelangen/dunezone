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

/**
 * The group page's exact wording, which the noun cannot derive: the trigger says what the reader is
 * about to do, the field says whose factions these are, and the commit says where they land.
 * Asserted here because deriving all three from `noun` silently rewrote this copy once, and only an
 * end-to-end spec noticed.
 */
export const CallerSuppliedCopy = meta.story({
  args: {
    noun: 'faction',
    size: 'sm',
    icon: <Plus size={14} aria-hidden />,
    title: 'Add a faction',
    triggerLabel: 'Add a faction you own',
    searchLabel: 'Search your factions',
    submitLabel: 'Add to this group',
    options: [{ value: 'faction-1', label: 'House Atreides — unassigned' }],
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(page.getByRole('button', { name: 'Add a faction you own' }));
    await waitFor(() =>
      expect(page.getByRole('combobox', { name: 'Search your factions' })).toBeVisible()
    );
    await expect(page.getByRole('button', { name: 'Add to this group' })).toBeVisible();
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
