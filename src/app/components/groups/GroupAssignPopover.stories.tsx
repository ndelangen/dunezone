import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import type { Id } from '../../../../convex/_generated/dataModel';
import { GroupAssignPopover } from './GroupAssignPopover';

const availableGroups = [
  {
    id: 'group-1' as Id<'groups'>,
    name: 'Arrakeen Rules Council',
    slug: 'arrakeen-rules-council',
  },
];

const meta = preview.meta({
  component: GroupAssignPopover,
  parameters: {
    layout: 'centered',
  },
  args: {
    disabled: false,
    onAssignGroup: fn(async () => undefined),
    assignableGroups: availableGroups,
  },
});

export const AvailableGroups = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Assign group' });

    await userEvent.click(trigger);

    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabelText('Search groups')).toBeVisible();
  },
});

export const NoAvailableGroups = meta.story({
  args: {
    assignableGroups: [],
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Assign group' }));
    await expect(page.getByText('No groups are available yet.')).toBeVisible();
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});
