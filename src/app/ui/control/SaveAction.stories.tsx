import { Group } from '@mantine/core';
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { SaveAction } from './SaveAction';

const meta = preview.meta({
  component: SaveAction,
  parameters: { layout: 'centered' },
  args: { label: 'Save faction', state: 'clean' as const, lines: ['No unsaved changes'], onSave: fn() },
});

/** Every state side by side: clean, unsaved changes (the dot), saving, saved, failed, and blocked. */
export const States = meta.story({
  render: (args) => (
    <Group gap="xs">
      <SaveAction {...args} label="Clean" state="clean" lines={['No unsaved changes']} />
      <SaveAction {...args} label="Dirty" state="dirty" lines={['Unsaved changes']} />
      <SaveAction {...args} label="Saving" state="saving" lines={['Saving']} />
      <SaveAction {...args} label="Saved" state="saved" lines={['Saved']} />
      <SaveAction {...args} label="Failed" state="failed" lines={['Save failed.']} />
      <SaveAction
        {...args}
        label="Blocked"
        state="dirty"
        lines={['Unsaved changes']}
        disabledReason="Add a faction name before saving."
      />
    </Group>
  ),
});

/** The hover text says where the work stands, then what the page adds. */
export const SaysWhereTheWorkStands = meta.story({
  args: {
    state: 'dirty' as const,
    lines: ['Unsaved changes', 'A new faction sheet capture is scheduled.'],
  },
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const save = page.getByRole('button', { name: 'Save faction' });
    await userEvent.hover(save);
    const tooltip = await waitForFrame(() => page.getByRole('tooltip'));
    await waitFor(() => expect(tooltip).toHaveTextContent('Unsaved changes'));
    await expect(tooltip).toHaveTextContent('A new faction sheet capture is scheduled.');
    await userEvent.click(save);
    await expect(args.onSave).toHaveBeenCalled();
  },
});

/** Blocked by a blank name: it looks disabled, says why, and pressing it saves nothing. */
export const Blocked = meta.story({
  args: { state: 'dirty' as const, lines: ['Unsaved changes'], disabledReason: 'Add a faction name before saving.' },
  play: async ({ args, canvasElement }) => {
    const save = within(canvasElement.ownerDocument.body).getByRole('button', { name: 'Save faction' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).toHaveAccessibleDescription('Unsaved changes Add a faction name before saving.');
    await userEvent.click(save);
    await expect(args.onSave).not.toHaveBeenCalled();
  },
});
