import { testingPreview } from '@sb/preview';
import { expect, userEvent } from 'storybook/test';

import { battlePlanPanelMeta, PLAN_WINDOW, planArgs } from './BattlePlanPanel.stories.fixture';

const meta = testingPreview.meta({
  ...battlePlanPanelMeta,
  title: 'Play/Panels/Battle plan',
  parameters: { panelWindow: PLAN_WINDOW },
});

/** A finished plan locks in with Ready. */
export const LocksIn = meta.story({
  args: planArgs('planned'),
  play: async ({ args, canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Ready for battle' }));
    await expect(args.plan?.onReady).toHaveBeenCalledWith(true);
  },
});
