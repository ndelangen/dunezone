import { Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { ListLengthActions } from '../control/ListLengthActions';
import { ListChapter } from './ListChapter';

const meta = preview.meta({
  component: ListChapter,
  parameters: { layout: 'padded' },
  args: {
    title: 'Decals',
    help: 'Decals are drawn on top of the background, in this order.',
    actions: (
      <ListLengthActions addLabel="Add decal" removeLabel="Remove last decal" onAdd={() => {}} onRemove={() => {}} />
    ),
  },
});

/** An empty list says so in a note under its heading; the controls stay on the heading's row. */
export const Empty = meta.story({
  args: { note: { title: 'No decals', text: 'Decals are optional. The card remains valid without them.' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Decals' })).toBeVisible();
    await expect(canvas.getByRole('note')).toHaveTextContent('No decals');
    await expect(canvas.getByRole('button', { name: 'Add decal' })).toBeVisible();
  },
});

/** With items, the note is gone and the items follow the heading. */
export const WithItems = meta.story({
  args: {
    children: (
      <>
        <Text size="sm">Decal 1</Text>
        <Text size="sm">Decal 2</Text>
      </>
    ),
  },
});

/** An unusual length can carry a caution while the items still show. */
export const Caution = meta.story({
  args: {
    title: 'Supporting leaders',
    note: { tone: 'caution', text: 'Most factions use five supporting leaders; this roster is still valid.' },
    children: <Text size="sm">Leader 1</Text>,
  },
});
