import preview from '@sb/preview';
import { Plus, Users } from 'lucide-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { AssignOptions, AssignPopover } from './AssignPopover';

const groups = [
  { value: 'group-1', label: 'Arrakeen Rules Council (arrakeen-rules-council)' },
  { value: 'group-2', label: 'Spice Cartel (spice-cartel)' },
];

/* The commit a story asserts on. Declared here rather than through `args` because the callback now
   belongs to the pane's contents, and the contents are what a story passes as `children`. */
const onAssign = fn(async () => undefined);

const meta = preview.meta({
  component: AssignPopover,
  parameters: { layout: 'centered' },
  args: {
    noun: 'group',
    disabled: false,
    icon: <Users size={17} aria-hidden />,
    children: <AssignOptions options={groups} onAssign={onAssign} />,
  },
  argTypes: { icon: { control: false }, children: { control: false } },
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Assign group' });

    await userEvent.click(trigger);

    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(page.getByRole('searchbox', { name: 'Search groups' })).toBeVisible());
    /* The suggestions are already in the pane, which keeps it to one floating layer, and choosing one commits it. */
    await expect(page.getByRole('option', { name: /Spice Cartel/ })).toBeVisible();
    await userEvent.click(page.getByRole('option', { name: /Spice Cartel/ }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledWith('group-2'));
  },
});

/** Every label follows the noun, so the other direction reads correctly without new props. */
export const DifferentNoun = meta.story({
  args: {
    noun: 'faction',
    title: 'Add a faction',
    size: 'sm',
    icon: <Plus size={14} aria-hidden />,
    children: (
      <AssignOptions options={[{ value: 'faction-1', label: 'House Atreides — unassigned' }]} onAssign={fn()} />
    ),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Add a faction' }));
    await waitFor(() => expect(page.getByRole('searchbox', { name: 'Search factions' })).toBeVisible());
  },
});

/**
 * The group page's exact wording, which the noun cannot derive: the trigger says what the reader is about to do and the field says whose factions these are.
 * Asserted here because deriving both from `noun` silently rewrote this copy once, and only an end-to-end spec noticed.
 */
export const CallerSuppliedCopy = meta.story({
  args: {
    noun: 'faction',
    size: 'sm',
    icon: <Plus size={14} aria-hidden />,
    title: 'Add a faction',
    triggerLabel: 'Add a faction you own',
    children: (
      <AssignOptions
        options={[{ value: 'faction-1', label: 'House Atreides — unassigned' }]}
        searchLabel="Search your factions"
        onAssign={fn()}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(page.getByRole('button', { name: 'Add a faction you own' }));
    await waitFor(() => expect(page.getByRole('searchbox', { name: 'Search your factions' })).toBeVisible());
  },
});

export const NothingToAssign = meta.story({
  args: { children: <AssignOptions options={[]} onAssign={fn()} /> },
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
    children: (
      <AssignOptions options={[]} emptyMessage="All your factions are already in this group." onAssign={fn()} />
    ),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Assign faction' }));
    await waitFor(() => expect(page.getByText('All your factions are already in this group.')).toBeVisible());
  },
});

/**
 * Still fetching the choices.
 * A pane whose contents fetch their own choices reaches this state on its own, because the read starts when the pane opens.
 */
export const Loading = meta.story({
  args: { children: <AssignOptions options={[]} loading onAssign={fn()} /> },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Assign group' }));
    await waitFor(() => expect(page.getByText('Loading groups…')).toBeVisible());
  },
});

export const Disabled = meta.story({
  args: { disabled: true },
});
