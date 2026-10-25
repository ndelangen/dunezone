import preview from '@sb/preview';
import type { ComponentType } from 'react';

import { PlanHarness, scenario } from './battlePlan.stories.fixture';
import type { Scenario, SlotSize } from './battlePlan.stories.fixture';
import { LedgerPlan } from './LedgerPlan';
import type { BattlePlanViewProps } from './planView';
import { StepsPlan } from './StepsPlan';
import { TrayPlan } from './TrayPlan';
import { WheelPlan } from './WheelPlan';

/*
 * Four takes on the Battle plan window's content, each a component of its own in the window's real frame at slot size.
 * The plan is live: every click changes it as the table would. Scenario and slot size are story controls.
 */
type Args = { scenario: Scenario; size: SlotSize };

const VARIANTS: Readonly<Record<string, ComponentType<BattlePlanViewProps>>> = {
  'A Ledger': LedgerPlan,
  'B Wheel': WheelPlan,
  'C Steps': StepsPlan,
  'D Tray': TrayPlan,
};

const meta = preview.meta({
  title: 'Play/Explorations/Battle plan window',
  globals: { motion: 'on' },
  parameters: { layout: 'centered', chromatic: { disableSnapshot: true } },
  tags: ['!test'],
  args: { scenario: 'fresh', size: 'slot' } satisfies Args,
  argTypes: {
    scenario: { control: 'inline-radio', options: ['fresh', 'planned', 'emperor', 'ready', 'countdown'] },
    size: { control: 'inline-radio', options: ['slot', 'narrow', 'wide', 'tall'] },
  },
});

/* One variant in a slot, its plan reset whenever the scenario changes. */
function renderVariant(variant: ComponentType<BattlePlanViewProps>) {
  return (args: unknown) => (
    <PlanHarness
      key={(args as Args).scenario}
      variant={variant}
      initial={scenario((args as Args).scenario)}
      size={(args as Args).size}
    />
  );
}

/** A, the ledger: the whole plan on one sheet; every part one click where it shows. */
export const Ledger = meta.story({ render: renderVariant(LedgerPlan) });

/** B, the wheel: the battle wheel itself is the editor; scroll or drag the ring to dial. */
export const Wheel = meta.story({ render: renderVariant(WheelPlan) });

/** C, the steps: leader, cards, dial, ready, one at a time; each pick moves on by itself. */
export const Steps = meta.story({ render: renderVariant(StepsPlan) });

/** D, the tray: the plan's slots above the hand; a click flies a piece across, sliders set the dial. */
export const Tray = meta.story({ render: renderVariant(TrayPlan) });

/** All four side by side, each with its own live plan. */
export const AllFour = meta.story({
  parameters: { layout: 'padded' },
  render: (args) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {Object.entries(VARIANTS).map(([name, variant]) => (
        <figure key={name} style={{ margin: 0 }}>
          <figcaption style={{ font: '600 0.8rem sans-serif', marginBottom: 6 }}>{name}</figcaption>
          <PlanHarness
            key={(args as Args).scenario}
            variant={variant}
            initial={scenario((args as Args).scenario)}
            size={(args as Args).size}
          />
        </figure>
      ))}
    </div>
  ),
});
