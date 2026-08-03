import preview from '@sb/preview';

import { treacheryCardFixtures } from '../../fixtures/treacheryCards';
import { TreacheryCard } from './Treachery';

const meta = preview.meta({
  component: TreacheryCard,
  globals: {
    viewport: {
      value: 'card',
    },
  },
});

export const Weapon = meta.story({ args: treacheryCardFixtures.lasgun });
export const FullBleedDecal = meta.story({ args: treacheryCardFixtures.weirdingWay });
export const Defense = meta.story({ args: treacheryCardFixtures.shield });
export const MulticolorDecal = meta.story({ args: treacheryCardFixtures.chemistry });
export const Special = meta.story({ args: treacheryCardFixtures.cheapHero });
export const Worthless = meta.story({ args: treacheryCardFixtures.baliset });
export const LongText = meta.story({ args: treacheryCardFixtures.supplies });
export const FactionIcon = meta.story({ args: treacheryCardFixtures.richeseKarama });
export const ScaledIcon = meta.story({ args: treacheryCardFixtures.shaiHulud });
export const Voice = meta.story({ args: treacheryCardFixtures.noSnooper });
export const LayeredDecals = meta.story({ args: treacheryCardFixtures.layeredDecals });
