import { BATTLE_DIALING_OPTIONS } from '@shared/rulesets/battleDialing';
import { helpLines } from '@ui/content/helpLines';
import { fn } from 'storybook/test';

import { panelMeta } from '../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../panelWindows';
import { scenario } from './battlePlan.stories.fixture';
import type { Scenario } from './battlePlan.stories.fixture';
import { BattlePlanPanel } from './BattlePlanPanel';
import type { BattlePlanPanelProps } from './BattlePlanPanel';

/** The window as the table shows it while the viewer has a plan: filled by the plan, the wheel's cards peeking over its top edge. */
export const PLAN_WINDOW = { ...PANEL_WINDOWS.battlePlan, help: 'Battle at Arrakeen', fill: true, peek: true };

/** The viewer's side of the story battle at Arrakeen, as the table hands it to the panel, each intent spied. */
export function planArgs(name: Scenario = 'fresh'): BattlePlanPanelProps {
  const view = scenario(name);
  /* Ready is the one change in its story, so nothing is shown to the table yet. */
  const plan = name === 'ready' ? { ...view.plan, disclosed: { ...view.plan.disclosed, cardIds: [] } } : view.plan;
  const dialing = BATTLE_DIALING_OPTIONS[plan.dialing];
  return {
    plan: { ...view, plan, onEdit: fn(), onReorder: fn(), onReady: fn(), onDisclose: fn() },
    notice: '',
    help: helpLines('Battle at Arrakeen', `${dialing.label} dialing.\n${dialing.description}`),
  };
}

export const battlePlanPanelMeta = {
  ...panelMeta(PANEL_WINDOWS.battlePlan),
  component: BattlePlanPanel,
  args: planArgs(),
};
