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

export const ValidBattleNumbers = meta.story({
  render: () => <BattleStepStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dial = canvas.getByRole('textbox', { name: 'Left dial' });
    await userEvent.clear(dial);
    await userEvent.type(dial, '2.3');
    await userEvent.tab();
    await expect(dial).toHaveValue('2.5');
    await userEvent.clear(dial);
    await userEvent.type(dial, '250');
    await userEvent.tab();
    await expect(dial).toHaveValue('25');
    const adjustment = canvas.getByRole('textbox', { name: 'Left adjustment' });
    await userEvent.clear(adjustment);
    await userEvent.type(adjustment, '-1.7');
    await userEvent.tab();
    await expect(adjustment).toHaveValue('-1.5');
    await userEvent.clear(adjustment);
    await userEvent.tab();
    await expect(adjustment).toHaveValue('');
    const spice = canvas.getByRole('textbox', { name: 'Left spice' });
    await userEvent.clear(spice);
    await userEvent.type(spice, '250');
    await userEvent.tab();
    await expect(spice).toHaveValue('25');
  },
});
