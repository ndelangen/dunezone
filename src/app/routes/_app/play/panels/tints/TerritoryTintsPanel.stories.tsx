import preview from '@sb/preview';

import { tintsPanelMeta, tintsProps, untintedSnapshot } from './TerritoryTintsPanel.stories.fixture';

/*
 * The Territory tints window on its own: each tint with its show, paint, outline, sticker, colour and remove controls,
 * the new-tint swatches and the board's presets under them.
 */
const meta = preview.meta({ ...tintsPanelMeta, title: 'Play/Panels/Territory tints' });

/** The two presets laid: the Fremen deployment over sixteen territories, and the Shield Wall destroyed. */
export const Tints = meta.story({});

/** The Fremen deployment's paintbrush on: its row says to click territories on the board. */
export const Painting = meta.story({ args: tintsProps(undefined, 'tint-fremen') });

/** A table with no tints yet: only the new-tint swatches and the presets. */
export const Empty = meta.story({ args: tintsProps(untintedSnapshot()) });

/** A spectator sees the tints but can change none of them. */
export const ReadOnly = meta.story({ args: { ...tintsProps(), canEdit: false, canCreate: false } });
