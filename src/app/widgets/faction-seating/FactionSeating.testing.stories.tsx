import { testingPreview } from '@sb/preview';
import { expect, fn, waitFor, within } from 'storybook/test';

import { FactionSeating } from './FactionSeating';
import { SEATS } from './FactionSeating.stories.fixture';

const meta = testingPreview.meta({
  title: 'Faction Seating',
  component: FactionSeating,
  parameters: { layout: 'padded' },
  args: { seats: SEATS, onReorder: fn(), onRemove: fn(), onAdd: fn() },
});

export const ReorderReportsIds = meta.story({
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    canvas.getByRole('button', { name: 'Move Atreides' }).focus();
    await userEvent.keyboard('[Space][ArrowDown]');
    await waitFor(() =>
      expect(body.getByText('Draggable item atreides was moved over droppable area fremen.')).toBeInTheDocument()
    );
    await userEvent.keyboard('[Space]');
    await expect(args.onReorder).toHaveBeenCalledWith(['fremen', 'atreides', 'emperor']);
  },
});

export const RemoveReportsId = meta.story({
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Remove Fremen' }));
    await expect(args.onRemove).toHaveBeenCalledWith('fremen');
  },
});

export const AddReportsIntent = meta.story({
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Add a faction' }));
    await expect(args.onAdd).toHaveBeenCalledOnce();
  },
});

export const CallerOwnsSeatLimits = meta.story({
  args: { removeDisabledReason: 'Keep at least two factions.', addDisabledReason: 'The table is full.' },
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const remove = canvas.getByRole('button', { name: 'Remove Atreides' });
    const add = canvas.getByRole('button', { name: 'Add a faction' });
    await expect(remove).toHaveAccessibleDescription('Keep at least two factions.');
    await expect(add).toHaveAccessibleDescription('The table is full.');
    await userEvent.click(remove);
    await userEvent.click(add);
    await expect(args.onRemove).not.toHaveBeenCalled();
    await expect(args.onAdd).not.toHaveBeenCalled();
  },
});
