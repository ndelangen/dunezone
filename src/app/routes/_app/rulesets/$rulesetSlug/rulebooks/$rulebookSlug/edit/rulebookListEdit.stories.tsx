import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { listChange, ListStory } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/List/Editing',
  parameters: { layout: 'fullscreen' },
});

export const NumberedList = meta.story({
  render: () => (
    <ListStory
      initialValue={{
        style: 'numbered',
        itemOrder: ['AAAA', 'BBBB'],
        itemsById: {
          AAAA: { id: 'AAAA', name: 'Ship troops', text: 'Pay spice to bring reserves to Dune.' },
          BBBB: { id: 'BBBB', name: 'Move troops', text: 'Choose one group to move.' },
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
    await expect(listChange.mock.lastCall?.[0].itemsById.AAAA.icon).toBe('/vector/icon/storrm_standalone.svg');
    await userEvent.click(canvas.getByRole('button', { name: 'Reorder item 1' }));
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await waitFor(() => expect(listChange.mock.lastCall?.[0].itemOrder).toEqual(['BBBB', 'AAAA']));
    await expect(listChange.mock.lastCall?.[0].itemsById.AAAA.name).toBe('Ship troops first');
    await expect(listChange.mock.lastCall?.[0].itemsById.AAAA.icon).toBe('/vector/icon/storrm_standalone.svg');
    await userEvent.click(canvas.getByLabelText('Clear artwork'));
    await expect(listChange.mock.lastCall?.[0].itemsById.AAAA.icon).toBeUndefined();
    await userEvent.click(canvas.getByRole('button', { name: 'Add item' }));
    await expect(listChange.mock.lastCall?.[0].itemOrder).toHaveLength(3);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last item' }));
    await expect(listChange.mock.lastCall?.[0].itemOrder).toEqual(['BBBB', 'AAAA']);
  },
});

/** An empty bulleted list previews as a bulleted list with no items, and offers its first one. */
export const EmptyBulletedList = meta.story({
  render: () => <ListStory initialValue={{ style: 'bulleted', itemOrder: [], itemsById: {} }} />,
  play: async ({ canvasElement }) => {
    const preview = within(canvasElement.querySelector<HTMLElement>('[data-rulebook-block-canvas]')!);
    const list = preview.getByRole('list');
    await expect(list.tagName).toBe('UL');
    await expect(within(list).queryAllByRole('listitem')).toHaveLength(0);
    await expect(within(canvasElement).getByRole('button', { name: 'Add item' })).toBeVisible();
  },
});
