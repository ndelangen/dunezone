import preview from '@sb/preview';

import { alliancesPanelMeta, alliancesProps, alliedSnapshot, finishedSnapshot } from './AlliancesPanel.stories.fixture';

/*
 * The Alliances window on its own, as seat 2 sees a six-seat game mid-play: every faction by its token,
 * ringed in its allies' colours, its status, and the one action the viewer has about it.
 */
const meta = preview.meta({ ...alliancesPanelMeta, title: 'Play/Panels/Alliances' });

/** Seat 1 offers the viewer an alliance, seats 4 and 5 are allied, and every other faction can be offered one. */
export const Offers = meta.story({});

/** The viewer is allied with seat 4: their own row breaks it, and the ally's row says so. */
export const Allied = meta.story({ args: alliancesProps(alliedSnapshot()) });

/** The game is finished: who was allied still shows, and no row has an action. */
export const Finished = meta.story({ args: alliancesProps(finishedSnapshot()) });
