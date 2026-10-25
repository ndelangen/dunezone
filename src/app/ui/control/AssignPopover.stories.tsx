import preview from '@sb/preview';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { AssignOptions } from './AssignPopover';
import { onAssign } from './AssignPopover.stories.fixture';
import { assignPopoverMeta } from './AssignPopover.stories.fixture';

const meta = preview.meta({ ...assignPopoverMeta });

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

export const NothingToAssign = meta.story({
  args: { children: <AssignOptions options={[]} onAssign={fn()} /> },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Assign group' }));
    await waitFor(() => expect(page.getByText('No groups are available yet.')).toBeVisible());
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
