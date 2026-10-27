import preview from '@sb/preview';

import { replayPanelMeta } from './ReplayPanel.stories.fixture';

/* The Replay window on its own: browsing the table's saved phases and returning to the live table. */
const meta = preview.meta({ ...replayPanelMeta, title: 'Play/Panels/Replay' });

/** At the live table: the replay starts from the first saved phase. */
export const Live = meta.story({});

/** A fixture table browsing its saved phases from the window, step by step. */
export const Browsing = meta.story({ args: { replay: { kind: 'browsing', step: 3, lastStep: 9 } } });

/** A hosted game browsing its saved phases, which its header steps through. */
export const InTheHeader = meta.story({ args: { replay: { kind: 'header' } } });
