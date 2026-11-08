import preview from '@sb/preview';
import type { BattlePlan, BattlePlanInput } from '@shared/play/battle';
import { useState } from 'react';

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

/* The battle strength's digits slide to each new total; change the troops, the spice, the leader or the adjustment to see it. */
const meta = preview.meta({
  ...battlePlanPanelMeta,
  title: 'Play/Animation trials/Battle strength',
  parameters: { ...battlePlanPanelMeta.parameters, panelWindow: PLAN_WINDOW },
  globals: { motion: 'on' },
  render: () => <PlayedPlan />,
});

/** By hand: each digit that changes slides through its own slot, up as the strength grows and down as it shrinks. */
export const SlidingDigits = meta.story({});
