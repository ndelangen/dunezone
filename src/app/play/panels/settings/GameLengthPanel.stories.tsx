import preview from '@sb/preview';

import { gameLengthPanelMeta } from './GameLengthPanel.stories.fixture';

/* The Settings window on its own: the turn the game ends after, which the turn wheel counts up to. */
const meta = preview.meta({ ...gameLengthPanelMeta, title: 'Play/Panels/Settings' });

/** A seated player may change the last turn. */
export const GameLength = meta.story({});

/** An observer reads the last turn, with no field to change it. */
export const Observer = meta.story({ args: { observing: true } });
