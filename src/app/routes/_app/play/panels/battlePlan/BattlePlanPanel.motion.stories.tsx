import preview from '@sb/preview';
import type { BattlePlan, BattlePlanInput } from '@shared/play/battle';
import type { Decorator } from '@storybook/tanstack-react';
import { useState } from 'react';

import { useTrialVariant } from '../../motionTrials.stories.fixture';
import { BattlePlanPanel } from './BattlePlanPanel';
import { battlePlanPanelMeta, PLAN_WINDOW, planArgs } from './BattlePlanPanel.stories.fixture';

/*
 * The trial's own stand-in for the table: each edit is applied at once and the strength moved by a rough count of the
 * change (troops at their strength, spiced troops at their supported strength, plus the adjustment), so the total moves as you play.
 */
function rough(plan: Pick<BattlePlan, 'faces' | 'troops' | 'adjustment'>) {
  const faces = new Map(plan.faces.map((face) => [face.id, face]));
  return plan.troops.reduce((total, troop) => {
    const face = faces.get(troop.faceId);
    return face ? total + troop.undialed * face.strength + troop.dialed * face.supportedStrength : total;
  }, plan.adjustment);
}

/* With Max support the table spends the spice on as many troops as it covers, as the game does. */
function supported(plan: BattlePlan): BattlePlan {
  if (plan.mode !== 'max') {
    return plan;
  }
  let spice = plan.spice;
  const troops = plan.troops.map((troop) => {
    const cost = plan.faces.find((face) => face.id === troop.faceId)?.supportCost ?? 1;
    const total = troop.undialed + troop.dialed;
    const dialed = Math.min(total, Math.floor(spice / Math.max(1, cost)));
    spice -= dialed * cost;
    return { ...troop, dialed, undialed: total - dialed };
  });
  return { ...plan, troops };
}

function summed(plan: BattlePlan, patch: Partial<BattlePlanInput>): BattlePlan {
  const next = supported({ ...plan, ...patch });
  return { ...next, strength: Math.max(0, plan.strength + rough(next) - rough(plan)) };
}

function PlayedPlan() {
  const start = planArgs('planned');
  const [plan, setPlan] = useState(start.plan!.plan);
  return (
    <BattlePlanPanel
      {...start}
      plan={{ ...start.plan!, plan, onEdit: (patch) => setPlan((before) => summed(before, patch)) }}
    />
  );
}

function strengthTrial(variant?: string): Decorator {
  function Pin() {
    useTrialVariant('strength', variant);
    return null;
  }
  return (Story) => (
    <>
      <Story />
      <Pin />
    </>
  );
}

/*
 * Animation trials for the battle strength landing on its new total. Change the troops, the spice, the leader or the
 * adjustment in each story to see it. Once one is chosen it becomes the total's own and these trials go.
 */
const meta = preview.meta({
  ...battlePlanPanelMeta,
  title: 'Play/Animation trials/Battle strength',
  parameters: { ...battlePlanPanelMeta.parameters, panelWindow: PLAN_WINDOW },
  globals: { motion: 'on' },
  render: () => <PlayedPlan />,
});

/** Today: the total rolls to its new value. */
export const Current = meta.story({ decorators: [strengthTrial()] });

/** The total rolls, then pops as it lands. 460 ms. */
export const Pop = meta.story({ decorators: [strengthTrial('pop')] });

/** The total rolls, then drops onto its line with the Panel edge's two-step knock. 520 ms. */
export const Knock = meta.story({ decorators: [strengthTrial('knock')] });

/** A stronger plan swells as it rolls; a weaker one sinks a little and comes back up. 420 ms. */
export const Weigh = meta.story({ decorators: [strengthTrial('weigh')] });
