import { Textarea } from '@mantine/core';
import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

const meta = preview.meta({
  component: Textarea,
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Textarea',
    defaultValue: 'The sleeper must awaken.',
    minRows: 3,
  },
});

export const Default = meta.story({});

/** The theme makes every textarea grow with its text, so a long draft never scrolls inside the field. */
export const GrowsWithText = meta.story({
  args: {
    w: 320,
    defaultValue: Array.from({ length: 12 }, (_, line) => `Line ${line + 1} of a long draft.`).join('\n'),
  },
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole<HTMLTextAreaElement>('textbox', { name: 'Textarea' });
    await expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight);

    const before = field.clientHeight;
    await userEvent.type(field, '{Enter}One more line.{Enter}And another.');
    await expect(field.clientHeight).toBeGreaterThan(before);
    await expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight);
  },
});
