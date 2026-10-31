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

/** A Basic ruleset: every troop fights at full strength and spice plays no part, so the dial is troops alone. */
export const BasicDialing = meta.story({ parameters: inPlanWindow, args: planArgs('basic') });

/** A GF9 2.0 ruleset: troops at full strength, and 4 spice buys +2 spice strength once the dial reaches 4. */
export const Gf92Dialing = meta.story({ parameters: inPlanWindow, args: planArgs('gf92') });

/** The Fremen under GF9 2.0: their Battle Edge gives spice strength for free, so there is no spice to choose. */
export const Gf92FremenDialing = meta.story({ parameters: inPlanWindow, args: planArgs('gf92-fremen') });

/** A KISS ruleset: the first 2 troops dial free, each further troop owes 1 spice, which follows the troops. */
export const KissDialing = meta.story({ parameters: inPlanWindow, args: planArgs('kiss') });

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
