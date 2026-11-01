import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { StrengthField } from './LeaderStrengthInput.stories.fixture';

const meta = testingPreview.meta({
  title: 'Leader Strength Input',
  component: StrengthField,
  parameters: { layout: 'padded' },
  args: { initial: 5 },
});

/** A refused entry keeps the last good strength, and fixing the text clears the reason and saves it. */
export const KeepsTheLastGoodStrength = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole('textbox', { name: 'Strength' });
    await userEvent.clear(field);
    await userEvent.type(field, '10x');
    await expect(field).toHaveValue('10x');
    await expect(field).toHaveAccessibleDescription('Use a whole number or one character.');
    await expect(canvas.getByRole('status', { name: 'Saved strength' })).toHaveTextContent('10');

    await userEvent.type(field, '{Backspace}');
    await expect(field).toHaveValue('10');
    await expect(field).not.toHaveAccessibleDescription('Use a whole number or one character.');
    await userEvent.clear(field);
    await userEvent.type(field, 'X');
    await expect(canvas.getByRole('status', { name: 'Saved strength' })).toHaveTextContent('X');
  },
});
