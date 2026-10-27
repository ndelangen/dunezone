import preview from '@sb/preview';

import {
  alliancesPanelMeta,
  alliancesProps,
  alliedSnapshot,
  finishedSnapshot,
  observerProps,
  offeringSnapshot,
} from './AlliancesPanel.stories.fixture';

/*
 * The Alliances window on its own, as seat 2 sees a six-seat game mid-play: every other faction by its token,
 * its allies and status, and the one action the viewer has about it.
 */
const meta = preview.meta({ ...alliancesPanelMeta, title: 'Play/Panels/Alliances' });

/** Seat 1 offers the viewer an alliance, seats 4 and 5 are allied, and the two factions still alone can be offered one. */
export const Offers = meta.story({});

/** The viewer's offer to seat 3 waits as Offering…, which takes it back when clicked again. */
export const Offering = meta.story({ args: alliancesProps(offeringSnapshot()) });

/** The viewer is allied with seat 4: the ally's row breaks it, and no faction can be offered one until it is broken. */
export const Allied = meta.story({ args: alliancesProps(alliedSnapshot()) });

/** The game is finished: who was allied still shows, and no row has an action. */
export const Finished = meta.story({ args: alliancesProps(finishedSnapshot()) });

/** An observer holds no faction: every alliance shows, and no row has an action. */
export const Observer = meta.story({ args: observerProps() });
