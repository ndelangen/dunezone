import preview from '@sb/preview';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { GroupForm } from './GroupForm';

const meta = preview.meta({
  component: GroupForm,
  parameters: { layout: 'fullscreen' },
  args: {
    initialName: '',
    back: {
      label: 'Back to profile',
      renderRoot: ({ children, ...props }: Record<string, unknown>) => (
        <a {...props} href="#profile">
          {children as ReactNode}
        </a>
      ),
    },
    verb: 'create' as const,
    pending: false,
    error: null,
    onSubmit: fn(),
  },
});

/** Starting a group: an empty name, so Save waits for one. */
export const Start = meta.story({
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled();
    await userEvent.type(page.getByRole('textbox', { name: 'Group name' }), 'SietchTabr');
    await userEvent.click(page.getByRole('button', { name: 'Save group' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ name: 'SietchTabr' });
  },
});

/** Editing a group: its current name, and the save that failed under the field. */
export const EditFailed = meta.story({
  args: {
    initialName: 'SpiceGuild',
    verb: 'save' as const,
    back: {
      label: 'Back to group',
      renderRoot: ({ children, ...props }: Record<string, unknown>) => (
        <a {...props} href="#group">
          {children as ReactNode}
        </a>
      ),
    },
    error: new Error('That name is taken.'),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent('Group could not be saved');
  },
});
