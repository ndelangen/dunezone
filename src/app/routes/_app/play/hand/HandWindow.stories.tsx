import preview from '@sb/preview';

import { at, handWindowMeta } from './HandWindow.stories.fixture';

/*
 * The Hand & spice window on its own, in a bottom-left slot, with the Private side-table window bottom right.
 * It runs on the game Worker's own table in the browser, started from the recorded journey (captured from production),
 * so every action really happens: withdrawn spice leaves the reserve, a piece set aside lands on the side-table.
 * Right-click a piece for its actions. The seat control views the same table as another faction.
 * The live table settles at its own pace, so Chromatic takes no snapshot of it.
 */
const meta = preview.meta({
  ...handWindowMeta,
  title: 'Play/Windows/Hand and spice',
  parameters: { layout: 'fullscreen', playDebugger: true, chromatic: { disableSnapshot: true } },
});

/** Atreides mid-game: right-click a piece to play it in front of you or set it on the side-table, and withdraw spice. */
export const FullHand = meta.story({ beforeEach: at('Battle plan') });

/** Earlier, at Shipment, with a smaller hand. */
export const AtShipment = meta.story({ beforeEach: at('Shipment') });
