import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { BattlePlansStory } from './rulebookBattleStepEdit.stories.fixture';

const meta = preview.meta({ title: 'Blocks/Battle plans/Editing', parameters: { layout: 'fullscreen' } });
export const StandalonePlans = meta.story({
  render: () => <BattlePlansStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('textbox', { name: 'Explanation' })).not.toBeInTheDocument();
    const dial = canvas.getByRole('textbox', { name: 'Left dial' });
    await userEvent.clear(dial);
    await userEvent.type(dial, '4');
    await userEvent.tab();
    await expect(dial).toHaveValue('4');
    expect(canvasElement.querySelector('.rulebookBattlePlans')).not.toBeNull();
    expect(canvasElement.querySelector('.rulebookBattleNarrative')).toBeNull();
  },
});
