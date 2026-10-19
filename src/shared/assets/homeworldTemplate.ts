import type { z } from 'zod';

import { NEXUS_HEAD } from './nexusTemplate';
import type { HomeworldCardAsset } from './schema';

/** Homeworld keeps the Nexus texture treatment with its own teal palette. */
export const HOMEWORLD_HEAD: typeof NEXUS_HEAD = { ...NEXUS_HEAD, colors: ['#07585C', '#249397'] };

/** The empty Homeworld uses the shared card head and the existing planet catalogue. */
export const EMPTY_HOMEWORLD_CARD: z.infer<typeof HomeworldCardAsset> = {
  name: '',
  subName: 'Homeworld',
  about: '',
  head: HOMEWORLD_HEAD,
  icon: [HOMEWORLD_HEAD, '/image/planet/04.png'],
  threshold: 6,
  high: { strength: 2, text: '' },
  low: { strength: 2, text: '' },
  occupied: '',
};

/** Layout proof and the preset preview use illustrative homebrew effects, never seeded stock content. */
export const EXAMPLE_HOMEWORLD_CARD: z.infer<typeof HomeworldCardAsset> = {
  ...EMPTY_HOMEWORLD_CARD,
  name: 'Pelagos',
  high: {
    strength: 3,
    text: 'When you win a battle, you may add 1 force from your reserves to the territory where the battle occurred, if you already have a force there.',
  },
  low: { strength: 1, text: 'Your first shipment each turn costs 1 extra spice. Pay this extra spice to the bank.' },
  occupied: 'The occupier collects 2 spice from the bank during Spice Collection.',
};
