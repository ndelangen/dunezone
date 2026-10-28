import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { battleHistoryPanelMeta } from './BattleHistoryPanel.stories.fixture';

/* The Battles window on its own: each agreed battle, who won, and both revealed wheels. */
const meta = preview.meta({ ...battleHistoryPanelMeta, title: 'Play/Panels/Battles' });

/** One agreed battle at Arrakeen: the left side won, and the winner's wheel holds a Treachery card. */
export const AgreedBattle = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^Arrakeen: .* against .*\. Left side won\.$/)).toBeVisible();
    await expect(canvas.getAllByLabelText(/plan, troop strength/)).toHaveLength(2);
  },
});

/** No battle agreed yet. */
export const Empty = meta.story({ args: { results: [] } });
