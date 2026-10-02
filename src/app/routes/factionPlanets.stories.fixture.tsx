import type { FactionInput } from '@shared/factions/schema';

/*
 * Public Space Orks faction copied from https://dune.zone/factions/space-orks on 2026-10-01.
 * Source: factions:getBySlug on exuberant-finch-263, queried without authentication.
 * Artwork keys resolve to the checked-in media sources; BigDave's public avatar already lives in the isolated Play fixtures.
 */
export const spaceOrks = {
  background: {
    colors: ['#52a32b', '#52a32b'],
    definition: 0.5,
    image: '/image/texture/021.jpg',
    influence: 1,
    invert: true,
  },
  colors: ['Green', 'Teal'],
  complexity: {
    calculated: 0.535483870967742,
  },
  decals: [
    {
      id: '/vector/generic/axes.svg',
      muted: true,
      offset: [0, 0],
      outline: false,
      scale: 0.5,
    },
  ],
  factionLeader: {
    image: '/image/leader/custom/boss.png',
    memberId: 'e8286de0-e879-4c28-aa9d-93701a432c08',
    name: 'Ghazghkull Thraka',
  },
  leaders: [
    {
      image: '/image/leader/alien/buzcle.png',
      memberId: '6757dcd2-29da-423b-b0c1-ff351bbf1df9',
      name: 'Mad Dok Grotsnik',
      strength: '2',
    },
    {
      image: '/image/leader/alien/eeekkono.png',
      memberId: 'a44675dc-7370-4ffa-878d-5733d1448e76',
      name: 'Boss Zagstruk',
      strength: '3',
    },
    {
      image: '/image/leader/alien/eeloo.png',
      memberId: '0676f6c9-5e9a-4e0f-9524-97feee85ab24',
      name: 'Ufthak Blackhawk',
      strength: '4',
    },
    {
      image: '/image/leader/alien/eelu.png',
      memberId: '8bf08bc4-44f2-4f27-b559-c5b3e85e67b3',
      name: 'Boss Snikrot',
      strength: 6,
    },
    {
      image: '/image/leader/alien/eeriva.png',
      memberId: 'a02500ff-b6c3-4b45-b84d-d0f3babf392c',
      name: 'Kaptin Badrukk',
      strength: 6,
    },
  ],
  logo: '/vector/generic/axes.svg',
  name: 'Space Orks',
  planet: [
    {
      description: 'A Hulking mass of debris cobbled together that drifts through space and time.',
      image: '/image/planet/10.png',
      name: 'Space Hulk Leviathan',
    },
  ],
  rules: {
    advantages: [
      {
        karama: 'Your leader does not get stronger after a battle. ',
        text: 'Each time one of your leaders is used in battle that resolves with no traitor call, slide a "Krump Klip" onto the leader disc, permanently adding +1 to their battle strength, even if they are killed.',
        title: 'Biggest is Best (Advanced)',
      },
      {
        karama: 'You roll no dice.',
        text: 'When making a battle plan, for every force you dial you will grab the same number of D6 dice. After plans are revealed, roll these dice and for every two dice that yield a result of 2 or higher, add 0.5 to your dial.',
        title: 'Unbridled Carnage',
      },
      {
        karama: "Must be karama'd before the roll. ",
        text: 'Instead of taking a normal shipping action, announce Da Jump and select 1 group of your forces on DUNE and select a destination territory. Roll a D6 and if the result is 4+ then all forces selected are sent to the selected territory, a result of 1-3 all forces are sent to a territory adjacent to the destination territory. ',
        title: 'Da Jump',
      },
      {
        karama: "No effect, the Ork's belief is stronger.",
        text: 'Whenever a Worthless card (including your own) is discarded in a battle you may take that Worthless card and add it to your hand. Worthless cards do not count against your hand limit in the Battle Phase.\nAt any time you may replace the top card of the Treachery discard pile with 2 Worthless cards, or a Worthless card and a Non-Worthless card from your hand. If multiple cards are discarded at once, you may select from any of the discarded cards if you declare your intent.',
        title: 'Skrappers',
      },
      {
        karama: "No effect, the Ork's belief is stronger.",
        text: 'At the end of the game, Roll 1 D100. If the Orks roll a 100 they instantly win the game, because they believe they have won.',
        title: 'Orks is Best',
      },
    ],
    alliance: {
      text: 'When making a battle plan, for every force you dial you will grab the same number of D6 dice. After plans are revealed, roll these dice and for every two dice that yield a result of 2 or higher, add 0.5 to your dial.',
    },
    fate: {
      text: 'During your turn in Shipping and Movement, you may move any number of groups of forces up to 4 territories, as long as they all have the same destination (this does not prevent you from also taking your regular movement or using effects like Hajr).',
      title: 'WAAAGGHHH!!!!:',
    },
    revivalText: 'For every force lost in battle, immediately revive 2 forces.',
    spiceCount: 10,
    startText: '10 forces Plastic Basin. 10 in Reserve, 10 in Tanks. 10 spice.',
  },
  themeColor: '#52a32b',
  troops: [
    {
      count: 30,
      description:
        'Abnormal forces, strength of 1, which can be spiced to increase their strength, on average, to 1.25.',
      image: '/vector/troop/juggernaut.svg',
      name: 'Troop',
      troopId: '8638003d-af63-456c-b8b8-c0f1eb63e648',
    },
  ],
} satisfies FactionInput;

export const spaceOrksOwner = {
  username: 'BigDave',
  slug: 'bigdave',
  avatar_url: '/play-fixtures/product/83308406d85921ae46daaa6ab5da2387b3e773b29251951012a20d64a917a5c0.jpg',
};

export const spaceOrksPublication = {
  published_at: 1_787_666_467_629,
  cache_token:
    'v1.GbILRdmR4AuCzAcw-8wQNA.PoSw4501r94hncY2brFX-EUyC68rPZXweGJz-ci2brM' /* NOSONAR: Public asset cache version returned without authentication, not a credential. */,
};
