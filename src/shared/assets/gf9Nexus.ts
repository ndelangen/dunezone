import type { z } from 'zod';

import type { DeckAsset, NexusCardAsset } from './schema';

/* Rules paraphrased from the twelve printed cards in GF9's Ecaz & Moritani expansion.
 * Reference photograph: https://boardgamegeek.com/image/7767032/dune-ecaz-and-moritani.
 * The faction names and conditions follow the printed deck, without tournament additions.
 */
const effects = [
  {
    faction: 'Atreides',
    symbol: 'atreides',
    colors: ['#4B4C0D', '#262B04'],
    betrayal: 'In a battle against Atreides, cancel their ability to see one element of your battle plan.',
    cunning: 'In battle, require your opponent to reveal a second element of their battle plan.',
    secretAlly:
      'In battle, require your opponent to reveal one element you choose: leader, weapon, defense or number dialed.',
  },
  {
    faction: 'Bene Gesserit',
    symbol: 'bene-gesserit',
    colors: ['#3A4491', '#101D65'],
    betrayal: 'In a battle against Bene Gesserit, prevent them from using Voice.',
    cunning:
      'During Shipping and Movement, flip any or all of your advisor groups to fighters. All your forces in a territory must be the same type.',
    secretAlly: 'In battle, use Voice to require your opponent to play, or not play, a type of Treachery card.',
  },
  {
    faction: 'CHOAM',
    symbol: 'choam',
    colors: ['#B48A23', '#5C4512'],
    betrayal: 'Force CHOAM to discard a random Treachery card. They receive no spice for the discard.',
    cunning: 'Discard any Treachery card to use the special effect of a Worthless card.',
    secretAlly:
      'During Spice Collection, discard a Worthless card to gain 2 spice. Or, after winning a battle, inspect a random Treachery card your opponent did not use in that battle.',
  },
  {
    faction: 'Ecaz',
    symbol: 'ecaz',
    colors: ['#496650', '#173A21'],
    betrayal:
      'Before Shipping and Movement, if Ecaz and their ally share a territory, return the ally’s forces in one such territory to their reserves.',
    cunning:
      'Take Duke Vidal for this turn, even if he is captured, in the tanks, a ghola or held by Moritani. Set him aside at the end of the turn.',
    secretAlly:
      'Choose a player. They must publicly say whether they hold any of your leaders as traitors, without saying which leaders.',
  },
  {
    faction: 'Emperor',
    symbol: 'emperor',
    colors: ['#A40008', '#8D0006'],
    betrayal:
      'During Bidding, make the Emperor pay for a card bought by their ally, if they have enough spice. Or cancel the Sardaukar advantage in a battle against them.',
    cunning:
      'Before making your battle plan, count 5 of your forces as Sardaukar if you have no Sardaukar in that battle.',
    secretAlly:
      'Keep the spice you would pay for a Treachery card, after showing you can afford it. Or revive 3 extra forces for free, beyond your normal revival limits.',
  },
  {
    faction: 'Fremen',
    symbol: 'fremen',
    colors: ['#F6A834', '#CF7317'],
    betrayal:
      'Prevent the Fremen from riding a sandworm this turn. Or prevent their two-territory movement during Shipping and Movement.',
    cunning:
      'When a sandworm appears in an empty territory, let one group of your forces in a desert territory ride it, subject to occupancy limits.',
    secretAlly: 'Prevent your forces from being devoured by a sandworm. Or revive 4 of your forces for free.',
  },
  {
    faction: 'Harkonnen',
    symbol: 'harkonnen',
    colors: ['#191311', '#000000'],
    betrayal:
      'Cancel a traitor revealed by Harkonnen and shuffle it into the Traitor deck. Harkonnen draws a replacement during the Mentat Pause.',
    cunning:
      'Draw a Traitor card, then secretly choose one of your Traitor cards and shuffle it into the Traitor deck.',
    secretAlly:
      'During the Mentat Pause, draw 2 Traitor cards and add them to your hand. Then secretly choose 2 of your Traitor cards and shuffle them into the Traitor deck.',
  },
  {
    faction: 'Ixians',
    symbol: 'ixian',
    colors: ['#D4BE6B', '#A88E2A'],
    betrayal: 'Prevent the Ixians from using their Bidding advantage or their Technology advantage, but not both.',
    cunning:
      'Before making your battle plan, count all your suboids at full strength, without paying spice, in every battle this turn.',
    secretAlly:
      'During Bidding, you may discard a Treachery card you just bought and draw the top card of the Treachery deck instead.',
  },
  {
    faction: 'Moritani',
    symbol: 'moritani',
    colors: ['#0B4D64', '#05333D'],
    betrayal: 'Remove one terror token from the board and return it to Moritani without revealing it.',
    cunning:
      'When placing a terror token, you may place it in any Arrakis territory, including one that already contains a terror token.',
    secretAlly:
      'After losing a battle with a winner, keep one Treachery card you played that you could have kept if you had won.',
  },
  {
    faction: 'Richese',
    symbol: 'richese',
    colors: ['#A6AFB5', '#50616B'],
    betrayal:
      'Discard a Richese Treachery card they were going to buy; no spice is paid. Or send the spice from a Richese weapon-card sale to the Spice Bank instead of Richese.',
    cunning:
      'Use 2 no-fields for a single shipment, which counts as one shipment. Reveal one immediately and put that no-field in front of your shield.',
    secretAlly:
      'Instead of your normal shipment, ship up to 5 forces from your reserves for the cost of shipping 1 force.',
  },
  {
    faction: 'Spacing Guild',
    symbol: 'guild',
    colors: ['#D83C13', '#B41C0C'],
    betrayal:
      'Take the full payment for one shipment, including your own, that would go to the Guild or Spice Bank. This overrides Junction’s shipment income.',
    cunning:
      'Make a second shipment immediately after Shipping and Movement. You cannot move those forces unless you use Hajr.',
    secretAlly:
      'Use Guild shipment rates. As your shipping action, you may ship between territories or return forces to your reserves.',
  },
  {
    faction: 'Tleilaxu',
    symbol: 'bene-tleilaxu',
    colors: ['#6E008F', '#2D006B'],
    betrayal: 'Cancel a revealed Face Dancer. It stays revealed until all Face Dancers have been revealed.',
    cunning:
      'Set aside all revealed Face Dancers and secretly draw replacements. Then shuffle the set-aside cards back into the Traitor deck.',
    secretAlly: 'During Revival, revive one of your leaders for free and up to 5 of your forces for 1 spice each.',
  },
] as const;

const head = {
  image: '/image/texture/082.jpg',
  colors: ['#264C43', '#15352E'],
  influence: 0.5,
  invert: false,
  definition: 1,
} as const;

export const GF9_NEXUS_CARDS: readonly z.infer<typeof NexusCardAsset>[] = effects.map(
  ({ faction, symbol, colors, ...rules }) => ({
    name: faction,
    faction,
    subName: 'Nexus',
    about:
      'GF9 Ecaz & Moritani Nexus card. Rules paraphrased from the printed card. Reference: https://boardgamegeek.com/image/7767032/dune-ecaz-and-moritani',
    head: { ...head, colors: [...head.colors] },
    icon: [{ ...head, colors: [...head.colors] }, '/vector/icon/alliance.svg'],
    factionSymbol: {
      image: `/vector/logo/${symbol}.svg` as z.infer<typeof NexusCardAsset>['factionSymbol']['image'],
      background: { ...head, colors: [...colors] },
    },
    ...rules,
  })
);

export const GF9_NEXUS_DECK: z.infer<typeof DeckAsset> = {
  name: 'GF9 Nexus Deck',
  about:
    'The twelve Nexus cards from GF9’s Ecaz & Moritani expansion, one of each faction. Rules follow the printed deck. Card artwork is recreated for Dune Zone.',
  cardback: {
    mode: 'custom',
    name: 'Nexus',
    image: '/vector/icon/alliance.svg',
    imageOffset: [0, 0],
    imageScale: 0.55,
    background: { ...head, colors: [...head.colors] },
  },
};
