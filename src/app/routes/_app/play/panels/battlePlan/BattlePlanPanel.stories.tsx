import preview from '@sb/preview';

import { battlePlanPanelMeta, PLAN_WINDOW, planArgs } from './BattlePlanPanel.stories.fixture';

/* The Battle plan window on its own: the viewer's private plan for the battle on the table, or why there is none. */
const meta = preview.meta({ ...battlePlanPanelMeta, title: 'Play/Panels/Battle plan' });

/* A plan fills its window under the wheel, as the table shows it. */
const inPlanWindow = { panelWindow: PLAN_WINDOW };

/** A fresh plan for Harkonnen against the Atreides: nothing chosen yet. */
export const Fresh = meta.story({ parameters: inPlanWindow });

/** A plan with a leader, a card, troops and spice chosen. */
export const Planned = meta.story({ parameters: inPlanWindow, args: planArgs('planned') });

/** The plan locked in, waiting on the other side. */
export const Ready = meta.story({ parameters: inPlanWindow, args: planArgs('ready') });

/** The Fremen fight at full strength without spice, so the plan has no spice row and no Custom mode. */
export const Fremen = meta.story({ parameters: inPlanWindow, args: planArgs('fremen') });

/** Several leaders in one plan: each joins the wheel, and their strengths add up. */
export const SeveralLeaders = meta.story({ parameters: inPlanWindow, args: planArgs('leaders') });

/** No battle on the table: the window says how to begin one. */
export const NoBattle = meta.story({
  args: { plan: null, notice: 'No battle in progress.', help: 'Drag the battle marker onto a territory to begin.' },
});

/** A battle the viewer has no side in yet. */
export const ClaimASide = meta.story({
  args: { plan: null, notice: 'Claim a side on the table to prepare your private plan.', help: 'Battle at Arrakeen' },
});
