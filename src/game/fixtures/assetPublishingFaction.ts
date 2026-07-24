import { type FactionInput, FactionInputSchema } from '../schema/faction';

const assetPublishingFactionInput = {
  name: 'Atreides',
  logo: '/vector/logo/atreides.svg',
  colors: ['Green', 'Blue'],
  background: {
    image: '/image/texture/021.jpg',
    colors: ['#4b4c0d', '#d9c979'],
    invert: true,
    definition: 0.55,
    influence: 1,
  },
  themeColor: '#4b4c0d',
  hero: {
    name: 'Lady Jessica',
    image: '/image/leader/official/jessica.png',
  },
  leaders: [
    { name: 'Dr. Yueh', image: '/image/leader/official/dryeuh.png', strength: '1' },
    { name: 'Duncan Idaho', image: '/image/leader/official/duncan.png', strength: '2' },
    { name: 'Gurney Halleck', image: '/image/leader/official/gurney.png', strength: '4' },
    { name: 'Thufir Hawat', image: '/image/leader/official/thufir.png', strength: '5' },
    { name: 'Lady Jessica', image: '/image/leader/official/jessica.png', strength: '5' },
  ],
  decals: [],
  troops: [
    {
      name: 'Regular troop',
      image: '/vector/troop/atreides.svg',
      description: 'Atreides regular troop',
      count: 20,
    },
  ],
  rules: {
    startText: '10 troops in Arrakeen and 10 in reserve *(off planet)*. Start with 10 spice.',
    revivalText: '2 troops free.',
    spiceCount: 10,
    advantages: [
      { text: 'You have limited prescience.' },
      {
        title: 'Bidding prescience',
        text: 'During each bidding round you may look at each Treachery Card as it comes up for bid.',
        karama:
          'You can no longer look at cards as they come up for bid until the end of the turn.',
      },
      {
        title: 'Information broker',
        text: 'You may sell truthful information about the next card for auction to another player.',
      },
      {
        title: 'Battle prescience',
        text: 'During battle you may force your opponent to reveal one part of their battle plan early.',
        karama: 'Your opponent does not have to reveal part of their battle plan early this turn.',
      },
      {
        title: "Leto's tithe",
        text: 'During Spice Collection take spice from the bank when you control one or more strongholds.',
      },
      {
        title: 'Kwisatz Haderach',
        text: 'After losing seven troops in battle, add the token to one leader per turn for extra strength.',
        karama: 'You cannot add the Kwisatz Haderach token to a leader this turn.',
      },
    ],
    alliance: {
      text: 'You may assist your ally by forcing their opponent to show one battle-plan element.',
    },
    fate: {
      title: 'Arrakis fiefdom',
      text: 'Play your fate card before Ship and Move to obtain the Carryall Tech Token.',
    },
  },
} satisfies FactionInput;

/** Stable, representative payload for asset-publishing integration and regression coverage. */
export const assetPublishingFaction: FactionInput = FactionInputSchema.parse(
  assetPublishingFactionInput
);
