import preview from '@sb/preview';

import { gameMeta, install } from '../game.stories.fixture';
import { chapter, journeyViewers } from '../journey.stories.fixture';
import { sandboxTransport } from '../sandbox.stories.fixture';
import { HandWindowHarness } from './HandWindowHarness.stories.fixture';

/*
 * Four prototypes of the Hand & spice window's content, each on its own in a bottom-left slot.
 * Each runs on the game Worker's own table in the browser, started from the recorded journey (captured from production),
 * so every action really happens: withdrawn spice leaves the reserve, a piece set aside leaves the hand, the plan fills.
 * The seat control views the same table as another faction.
 */
const meta = preview.meta({
  title: 'Play/Explorations/Hand and spice',
  component: HandWindowHarness,
  decorators: gameMeta.decorators,
  globals: { motion: 'on' },
  args: { seat: 'seat-2' },
  argTypes: { seat: { control: 'select', options: journeyViewers().filter((seat) => seat !== 'neutral') } },
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } },
  tags: ['!test'],
});

/* The live table from the recorded journey: Atreides (seat 2) mid-battle at Arrakeen, or earlier at Shipment with no battle. */
const inBattle = ({ args }: { args: { seat?: string } }) =>
  install(() => sandboxTransport({ start: chapter('Battle plan') - 1, seat: args.seat ?? 'seat-2' }))();
const quiet = ({ args }: { args: { seat?: string } }) =>
  install(() => sandboxTransport({ start: chapter('Shipment') - 1, seat: args.seat ?? 'seat-2' }))();

/** A. Shelves: rows by kind, hover a piece for its one-click actions, spice by one-click amounts. */
export const AShelves = meta.story({ name: 'A Shelves', args: { variant: 'shelves' }, beforeEach: inBattle });

/** B. Fan: the cards held as a fanned hand, hover to read, click to pick, then act from the bar. */
export const BFan = meta.story({ name: 'B Fan', args: { variant: 'fan' }, beforeEach: inBattle });

/** C. Ledger: a readable row per piece, filtered by kind, spice by slider. */
export const CLedger = meta.story({ name: 'C Ledger', args: { variant: 'ledger' }, beforeEach: inBattle });

/** D. Battle-aware: in a battle the plan leads and a click moves a piece in or out of it. */
export const DBattleAware = meta.story({ name: 'D Battle-aware', args: { variant: 'battle' }, beforeEach: inBattle });

/** D outside a battle: it falls back to the shelves. */
export const DBattleAwareQuiet = meta.story({
  name: 'D Battle-aware, no battle',
  args: { variant: 'battle' },
  beforeEach: quiet,
});
