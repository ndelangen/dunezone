import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { IllustratedInventoryStory } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Inventory/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const IllustratedInventory = meta.story({
  render: () => (
    <IllustratedInventoryStory
      initialValue={{
        title: 'Game components',
        introduction: 'These pieces are used throughout the game.',
        itemOrder: ['MAPA', 'WORM'],
        itemsById: {
          MAPA: {
            id: 'MAPA',
            source: { kind: 'board', boardId: 'arrakis' },
            quantity: 1,
            text: 'Place forces on the territories.',
          },
          WORM: {
            id: 'WORM',
            source: { kind: 'stock', artworkId: '/vector/generic/plus.svg' },
            quantity: 6,
            text: 'An explanation stays with its source.',
          },
        },
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue('Place forces on the territories.');
    const handle = canvas.getByRole('button', { name: 'Reorder entry 1' });
    handle.focus();
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '2. Arrakis board' })).toHaveAttribute('aria-pressed', 'true')
    );
    await expect(canvas.getByRole('textbox', { name: 'Quantity' })).toHaveValue('1');
    await userEvent.click(canvas.getByRole('button', { name: 'Add entry' }));
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue('');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last entry' }));
    await expect(canvas.getAllByRole('button', { name: /Reorder entry/ })).toHaveLength(2);
  },
});
