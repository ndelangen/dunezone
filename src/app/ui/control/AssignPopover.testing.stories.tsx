import { MantineThemeProvider, Popover } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { Plus, Users } from 'lucide-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { AssignOptions, AssignPopover } from './AssignPopover';
import { groups, onAssign } from './AssignPopover.stories.fixture';

const meta = testingPreview.meta({
  component: AssignPopover,
  parameters: { layout: 'centered' },
  /* These stories test labels and assignment, not the opening fade.
     Keep the real portal and theme, but do not make visibility depend on animation-frame scheduling. */
  decorators: [
    (Story) => (
      <MantineThemeProvider
        theme={{ components: { Popover: Popover.extend({ defaultProps: { transitionProps: { duration: 0 } } }) } }}
      >
        <Story />
      </MantineThemeProvider>
    ),
  ],
  args: {
    noun: 'group',
    disabled: false,
    icon: <Users size={17} aria-hidden />,
    children: <AssignOptions options={groups} onAssign={onAssign} />,
  },
  argTypes: { icon: { control: false }, children: { control: false } },
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

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Assign group' });
    await expect(trigger).toBeDisabled();
    /* The disabled trigger takes no pointer events, so the click is forced past that check and still opens nothing. */
    await userEvent.click(trigger, { pointerEventsCheck: 0 });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  },
});
