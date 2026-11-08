import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import type { BattlePlan, BattlePlanInput } from '@shared/play/battle';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { BattlePlanPanel } from './BattlePlanPanel';
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

/*
 * The story's own stand-in for the table: each edit is applied at once and the strength moved by a rough count of the
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

/*
 * The stand-in keeps its own count unclamped, so taking an adjustment back restores the total the clamp at zero had hidden;
 * the panel is shown that count, floored at zero as the table floors it.
 */
function PlayedPlan() {
  const start = planArgs('planned');
  const [played, setPlayed] = useState(() => ({ plan: start.plan!.plan, count: start.plan!.plan.strength }));
  const edit = (patch: Partial<BattlePlanInput>) =>
    setPlayed(({ plan, count }) => {
      const next = supported({ ...plan, ...patch });
      const moved = count + rough(next) - rough(plan);
      return { plan: { ...next, strength: Math.max(0, moved) }, count: moved };
    });
  return <BattlePlanPanel {...start} plan={{ ...start.plan!, plan: played.plan, onEdit: edit }} />;
}

/** By hand: the battle strength rolls on odometer wheels to each new total, smoothly through quick changes; change the troops, spice, leader or adjustment. */
export const RollingStrength = meta.story({
  globals: { motion: 'on' },
  render: () => <PlayedPlan />,
  play: async ({ canvas, canvasElement }) => {
    const sum = canvasElement.querySelector<HTMLElement>('[aria-live="polite"]');
    await expect(sum).not.toBeNull();
    const total = () => Number(sum!.querySelector('.mantine-VisuallyHidden-root')?.textContent);
    /* Where each wheel stands: its faces' scroll. */
    const wheels = () =>
      [...sum!.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span')]
        .map((faces) => faces.style.translate)
        .join();
    const before = total();
    const stood = wheels();
    await expect(Number.isFinite(before)).toBe(true);
    await userEvent.click(canvas.getByRole('button', { name: /^Adjust the strength by hand/ }));
    const more = await waitForFrame(() =>
      within(canvasElement.ownerDocument.body).getByRole('button', { name: 'More: Adjustment' })
    );
    await userEvent.click(more);
    await userEvent.click(more);
    /* Two half steps up: the total reads one more at once, and the wheels roll away from where they stood. */
    await waitForFrame(() => expect(total()).toBe(before + 1));
    await waitForFrame(() => expect(wheels()).not.toBe(stood));
  },
});
