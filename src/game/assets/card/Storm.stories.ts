import preview from '@sb/preview';
import { standardStormCard } from '@shared/assets/standardStormDeck';

import { StormCard } from './Storm';

const meta = preview.meta({
  component: StormCard,
  globals: { viewport: { value: 'card' } },
  args: standardStormCard(1),
});
export const One = meta.story({});
export const Two = meta.story({ args: standardStormCard(2) });
export const Three = meta.story({ args: standardStormCard(3) });
export const Four = meta.story({ args: standardStormCard(4) });
export const Five = meta.story({ args: standardStormCard(5) });
export const Six = meta.story({ args: standardStormCard(6) });
