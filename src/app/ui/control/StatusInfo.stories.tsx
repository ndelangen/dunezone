import preview from '@sb/preview';
import { Check, CircleAlert, History, LoaderCircle } from 'lucide-react';
import { expect, userEvent, within } from 'storybook/test';

import { StatusInfo } from './StatusInfo';

const meta = preview.meta({
  component: StatusInfo,
  parameters: { layout: 'centered' },
  args: {
    label: 'Rulebook status',
    statuses: [
      { tone: 'positive' as const, icon: <Check size={16} aria-hidden />, label: 'Saved draft' },
      { icon: <History size={16} aria-hidden />, label: 'Draft revision 12' },
      {
        tone: 'progress' as const,
        icon: <LoaderCircle size={16} aria-hidden />,
        label: 'The PDF is still being prepared.',
      },
      { tone: 'negative' as const, icon: <CircleAlert size={16} aria-hidden />, label: 'The HTML could not be made.' },
    ],
  },
});

/** One info action; pressing it lists every status with its glyph in its tone, and the words are its description too. */
export const ListsEveryStatus = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const action = page.getByRole('button', { name: 'Rulebook status' });
    await expect(action).toHaveAccessibleDescription(
      'Saved draft Draft revision 12 The PDF is still being prepared. The HTML could not be made.'
    );
    await userEvent.click(action);
    const list = await page.findByRole('dialog', { name: 'Rulebook status' });
    await expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  },
});

/** With nothing to state, nothing renders. */
export const Empty = meta.story({
  args: { statuses: [null, false] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
  },
});
