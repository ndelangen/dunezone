import preview from '@sb/preview';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';

import { FactionLink } from './FactionLink';

const meta = preview.meta({
  component: FactionLink,
  parameters: { layout: 'centered' },
  args: {
    slug: 'house-atreides',
    name: 'House Atreides',
    emblem: assetPublishingFaction.emblem,
    background: assetPublishingFaction.background,
  },
});

/** The citation: the faction's own mark and its name, one link, ready to sit inside a sentence. */
export const Default = meta.story({});
