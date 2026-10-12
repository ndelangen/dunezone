import type { z } from 'zod';

import type { DeckAsset, StrongholdCardAsset } from './schema';
import { STRONGHOLD_BACKGROUND } from './strongholdCardTemplate';

const descriptions = [
  ['Arrakeen', 'arrakeen', 'The Spice Bank pays 2 spice toward your force support in each battle here.'],
  [
    'Carthag',
    'carthag',
    'If you play no poison weapon in a battle here, any non-poison defense you play also works as a Snooper.',
  ],
  ['Habbanya Sietch', 'habbanya', 'You win tied battles here, regardless of storm order or Juice of Sappho.'],
  [
    'HMS stronghold',
    'ixian',
    'Before Battle Plans are made, choose another Stronghold Card you control and copy its advantage. Name the card you are using.',
  ],
  [
    'Sietch Tabr',
    'tabr',
    "After winning a battle here, take spice from the Spice Bank equal to your opponent's dial, rounded down.",
  ],
  ["Tuek's Sietch", 'tuek', 'Take 2 spice from the Spice Bank for each Worthless Card you play in a battle here.'],
] as const;

/** The six CHOAM & Richese cards, with GF9 ability summaries and the supplied printed illustrations. */
export const GF9_STRONGHOLD_CARDS: z.infer<typeof StrongholdCardAsset>[] = descriptions.map(([name, key, text]) => ({
  name,
  about:
    'GF9 CHOAM & Richese advanced stronghold card. The Body summarizes the printed ability. The illustration is extracted from the supplied original cards.',
  text,
  textSize: 40,
  decals: [
    {
      id: `/image/decal/gf9-stronghold-${key}.png`,
      muted: false,
      outline: false,
      scale: 1.75,
      offset: [0, 0],
    },
  ],
}));

export const GF9_STRONGHOLD_DECK = {
  name: 'GF9 Stronghold Deck',
  about:
    "One of each of the six advanced stronghold cards from the GF9 CHOAM & Richese expansion. Cards pass to each stronghold's sole occupant at the end of a turn; Bene Gesserit advisors do not prevent control. The first claim is during the first Mentat Pause.",
  cardback: {
    mode: 'custom',
    name: 'Stronghold',
    image: '/vector/icon/stronghold-multicolor.svg',
    imageOffset: [0, 0],
    imageScale: 1.3,
    background: STRONGHOLD_BACKGROUND,
  },
} satisfies z.infer<typeof DeckAsset>;
