import { Button } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { PickerField } from './PickerField';

const meta = testingPreview.meta({
  title: 'PickerField',
  component: PickerField,
  args: {
    title: 'Faction',
    chosen: 'House Atreides',
    chooseLabel: 'Choose left faction',
    loadingLabel: 'Loading factions',
    onClear: fn(),
    picker: (close: () => void) => <Button onClick={close}>Use faction</Button>,
  },
});

/** The button opens the picker and says so, and the picker closes the field once it has picked. */
export const OpensAndCloses = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const choose = canvas.getByRole('button', { name: 'Choose left faction: House Atreides' });
    await expect(choose).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('button', { name: 'Use faction' })).toBeNull();
    await userEvent.click(choose);
    await expect(choose).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Use faction' }));
    await expect(canvas.queryByRole('button', { name: 'Use faction' })).toBeNull();
  },
});

/** The clear action is named from the title and empties the field. */
export const ClearsTheChoice = meta.story({
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Clear faction' }));
    await expect(args.onClear).toHaveBeenCalledOnce();
  },
});
