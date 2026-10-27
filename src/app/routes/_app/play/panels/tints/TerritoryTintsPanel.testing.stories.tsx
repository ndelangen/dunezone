import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { tintsPanelMeta, tintsProps, untintedSnapshot } from './TerritoryTintsPanel.stories.fixture';

const meta = testingPreview.meta({ ...tintsPanelMeta, title: 'Play/Panels/Territory tints' });

/** Each control on a row reports its tint and what it changes. */
export const RowControls = meta.story({
  play: async ({ args, canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Paint Fremen deployment' }));
    await expect(args.onBrush).toHaveBeenCalledWith('tint-fremen');
    await userEvent.click(canvas.getByRole('button', { name: 'Show Fremen deployment' }));
    await expect(args.onSet).toHaveBeenCalledWith('tint-fremen', 'hidden');
    const [, outline] = canvas.getAllByRole('button', { name: 'Outline only' });
    await userEvent.click(outline!);
    await expect(args.onSet).toHaveBeenCalledWith('tint-shield', 'outline');
    await userEvent.click(canvas.getByRole('button', { name: 'Stickers on Shield Wall destroyed' }));
    await userEvent.click(await body.findByRole('button', { name: 'City' }));
    await expect(args.onSet).toHaveBeenCalledWith('tint-shield', 'city');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByRole('button', { name: 'Colour of Shield Wall destroyed' }));
    await userEvent.click(await body.findByRole('button', { name: '#9450d080' }));
    await waitFor(() => expect(args.onColor).toHaveBeenCalledWith('tint-shield', '#9450d080'));
  },
});

/** A new tint starts with its paintbrush on; a preset is laid as it is, ready to paint. */
export const NewTintsAndPresets = meta.story({
  args: tintsProps(untintedSnapshot()),
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New green tint' }));
    await expect(args.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Green tint', territories: [] }),
      true
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Shield Wall destroyed' }));
    await expect(args.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Shield Wall destroyed', stamps: ['explode'], territories: ['shield_wall'] }),
      false
    );
  },
});
