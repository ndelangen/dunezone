import { MantineThemeProvider, Popover } from '@mantine/core';
import type { Meta } from '@storybook/tanstack-react';
import { Users } from 'lucide-react';
import { fn } from 'storybook/test';

import { AssignOptions, AssignPopover } from './AssignPopover';

const groups = [
  { value: 'group-1', label: 'Arrakeen Rules Council (arrakeen-rules-council)' },
  { value: 'group-2', label: 'Spice Cartel (spice-cartel)' },
];

/* The commit a story asserts on. Declared here rather than through `args` because the callback now
   belongs to the pane's contents, and the contents are what a story passes as `children`. */
export const onAssign = fn(async () => undefined);

export const assignPopoverMeta = {
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
} satisfies Meta<typeof AssignPopover>;
