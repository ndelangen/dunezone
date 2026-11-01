import { testingPreview } from '@sb/preview';
import { expect, fireEvent, userEvent, within } from 'storybook/test';

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

/** A refusal stays with the leader it was typed for: moving to another leader of the same strength shows that leader's own value. */
export const RefusalStaysWithItsLeader = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole('textbox', { name: 'Strength' });
    await userEvent.type(field, 'x');
    await expect(field).toHaveValue('5x');
    /* Switched without the field losing focus, so only the leader changes. */
    fireEvent.click(canvas.getByRole('button', { name: 'Other leader' }));
    await expect(field).toHaveFocus();
    await expect(field).toHaveValue('5');
    await expect(field).not.toHaveAccessibleDescription('Use a whole number or one character.');
  },
});

/** Leaving the field drops the refused text and shows the strength that was kept. */
export const BlurShowsTheKeptStrength = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole('textbox', { name: 'Strength' });
    await userEvent.type(field, 'x');
    await expect(field).toHaveValue('5x');
    await userEvent.tab();
    await expect(field).toHaveValue('5');
  },
});
