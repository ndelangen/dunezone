import { testingPreview } from '@sb/preview';
import { GF9_STRONGHOLD_CARDS } from '@shared/assets/gf9StrongholdDeck';

import { StrongholdCard } from './Stronghold';
import { checkBody } from './Stronghold.stories.fixture';

const meta = testingPreview.meta({
  title: 'Stronghold',
  component: StrongholdCard,
  globals: { viewport: { value: 'card' } },
  args: GF9_STRONGHOLD_CARDS[0],
});
export const Carthag = meta.story({ args: GF9_STRONGHOLD_CARDS[1], play: checkBody });
export const HabbanyaSietch = meta.story({ args: GF9_STRONGHOLD_CARDS[2], play: checkBody });
export const HMSStronghold = meta.story({ args: GF9_STRONGHOLD_CARDS[3], play: checkBody });
export const SietchTabr = meta.story({ args: GF9_STRONGHOLD_CARDS[4], play: checkBody });
export const TueksSietch = meta.story({ args: GF9_STRONGHOLD_CARDS[5], play: checkBody });
