import preview from '@sb/preview';

import { playingSnapshot } from '../../product.stories.fixture';
import { transfersPanelMeta, transfersProps } from './SpiceTransfersPanel.stories.fixture';

/* The Spice transfers window on its own: the table's public spice movements, newest first. */
const meta = preview.meta({ ...transfersPanelMeta, title: 'Play/Panels/Spice transfers' });

/** Every kind of transfer, each end named in words, with older transfers a click away. */
export const Transfers = meta.story({ args: { more: true } });

/** No spice has moved yet. */
export const Empty = meta.story({ args: transfersProps(playingSnapshot()) });
