import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { listChange, ListStory } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/List/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const NumberedList = meta.story({
  render: () => (
    <ListStory
      initialValue={{
        style: 'numbered',
        itemOrder: ['AAAA', 'BBBB'],
        itemsById: {
          AAAA: { id: 'AAAA', name: 'Ship forces', text: 'Pay spice to bring reserves to Dune.' },
          BBBB: { id: 'BBBB', name: 'Move forces', text: 'Choose one group to move.' },
        },
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    listChange.mockClear();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Item 1 name' }), ' first');
    await userEvent.click(canvas.getByRole('combobox', { name: 'Item 1 icon' }));
    await userEvent.type(canvas.getByRole('combobox', { name: 'Item 1 icon' }), 'storm');
    await userEvent.click(await within(document.body).findByRole('option', { name: 'Storm' }));
    expect(listChange.mock.lastCall?.[0].itemsById.AAAA.icon).toBe('/vector/icon/storrm_standalone.svg');
    await userEvent.click(canvas.getByRole('button', { name: 'Reorder item 1' }));
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await waitFor(() => expect(listChange.mock.lastCall?.[0].itemOrder).toEqual(['BBBB', 'AAAA']));
    expect(listChange.mock.lastCall?.[0].itemsById.AAAA.name).toBe('Ship forces first');
    expect(listChange.mock.lastCall?.[0].itemsById.AAAA.icon).toBe('/vector/icon/storrm_standalone.svg');
    await userEvent.click(canvas.getByLabelText('Clear artwork'));
    expect(listChange.mock.lastCall?.[0].itemsById.AAAA.icon).toBeUndefined();
    await userEvent.click(canvas.getByRole('button', { name: 'Add item' }));
    expect(listChange.mock.lastCall?.[0].itemOrder).toHaveLength(3);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last item' }));
    expect(listChange.mock.lastCall?.[0].itemOrder).toEqual(['BBBB', 'AAAA']);
  },
});

export const EmptyBulletedList = meta.story({
  render: () => <ListStory initialValue={{ style: 'bulleted', itemOrder: [], itemsById: {} }} />,
});
