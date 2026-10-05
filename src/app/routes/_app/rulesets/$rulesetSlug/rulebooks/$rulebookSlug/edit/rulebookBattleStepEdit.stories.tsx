import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { BattleStepStory } from './rulebookBattleStepEdit.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Battle step/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const PlansAndDialogue = meta.story({
  render: () => <BattleStepStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const supported = canvas.getByRole('textbox', { name: 'Left troop 1 supported' });
    await userEvent.clear(supported);
    await userEvent.type(supported, '3');
    await userEvent.tab();
    await expect(supported).toHaveValue('3');
    await userEvent.click(canvas.getByRole('switch', { name: 'Reveal left battle plan' }));
    await expect(canvas.getByRole('button', { name: 'Choose left known card' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Add dialogue' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Dialogue 1 speech' }), 'Which weapon are you using?');
    await expect(canvas.getByText('Which weapon are you using?', { selector: 'blockquote' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last dialogue' }));
    await expect(canvas.queryByRole('textbox', { name: 'Dialogue 1 speech' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last left troop group' }));
    await expect(canvas.queryByRole('textbox', { name: 'Left troop 1 supported' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Add left troop group' }));
    await expect(canvas.getByRole('textbox', { name: 'Left troop 1 supported' })).toHaveValue('0');
  },
});
