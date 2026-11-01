import preview from '@sb/preview';
import { userEvent, within } from 'storybook/test';

import { StrengthField } from './LeaderStrengthInput.stories.fixture';

const meta = preview.meta({
  title: 'Leader Strength Input',
  component: StrengthField,
  parameters: { layout: 'padded' },
  args: { initial: 5 },
});

/** Text the field cannot take stays in view with the reason, instead of the keystroke vanishing. */
export const Refused = meta.story({
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'Strength' });
    await userEvent.clear(field);
    await userEvent.type(field, '10x');
  },
});
