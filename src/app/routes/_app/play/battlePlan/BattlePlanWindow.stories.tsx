import preview from '@sb/preview';

import { PlanHarness, scenario } from './battlePlan.stories.fixture';
import type { Scenario, SlotSize } from './battlePlan.stories.fixture';

/*
 * The Battle plan window's content in the window's real frame at slot size.
 * The plan is live: every click changes it as the table would. Scenario and slot size are story controls.
 */
type Args = { scenario: Scenario; size: SlotSize };

const meta = preview.meta({
  title: 'Play/Explorations/Battle plan window',
  globals: { motion: 'on' },
  parameters: { layout: 'centered', chromatic: { disableSnapshot: true } },
  tags: ['!test'],
  args: { scenario: 'fresh', size: 'slot' } satisfies Args,
  argTypes: {
    scenario: {
      control: 'inline-radio',
      options: ['fresh', 'planned', 'emperor', 'fremen', 'leaders', 'ready', 'countdown'],
    },
    size: { control: 'inline-radio', options: ['slot', 'narrow', 'wide', 'tall'] },
  },
});

/* The plan in a slot, reset whenever the scenario changes. */
const render = (args: unknown) => (
  <PlanHarness key={(args as Args).scenario} initial={scenario((args as Args).scenario)} size={(args as Args).size} />
);

/** The ledger: the wheel at the top, its cards peeking over the window's edge; the whole plan on one sheet below it. */
export const Ledger = meta.story({ render });

/** The Fremen: two troop types, dialed for free, so no spice row and no Custom mode. */
export const Fremen = meta.story({ args: { scenario: 'fremen' }, render });

/** Several leaders in one plan: each picked leader joins the wheel, stacked behind the first, and their strengths add up. */
export const SeveralLeaders = meta.story({ args: { scenario: 'leaders' }, render });
