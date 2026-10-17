import type { z } from 'zod';

import { NEXUS_HEAD } from './nexusTemplate';
import type { DeckAsset, NexusCardAsset } from './schema';

/* These rules follow the twelve 2022 GF9 card scans supplied for the Nexus correction.
 * Fremen grants three free revivals, and Richese repeats the Ixians Secret Ally in these scans.
 */
const effects = [
  {
    faction: 'Atreides',
    symbol: 'atreides',
    colors: ['#586721', '#263C10'],
    betrayal: 'Prevent the Atreides Battle advantage of seeing one element of any Battle Plan.',
    cunning: 'Force your opponent to show you a second element of their Battle Plan.',
    secretAlly:
      'During a battle, force your opponent to reveal your choice of one element of their Battle Plan: leader, weapon, defense, or number dialed.',
  },
  {
    faction: 'Bene Gesserit',
    symbol: 'bene-gesserit',
    colors: ['#254F83', '#13294D'],
    betrayal: 'Prevent the Bene Gesserit from using their Voice advantage.',
    cunning:
      'You may flip any or all groups of your advisors to fighters during your turn in the Shipment and Movement phase (all troops in a territory must end up the same type).',
    secretAlly:
      'During a battle, you may use the Bene Gesserit Voice advantage of forcing your opponent to play or not play a Treachery Card.',
  },
  {
    faction: 'CHOAM',
    symbol: 'choam',
    colors: ['#EB0220', '#252527'],
    betrayal: 'Force CHOAM to discard a card at random from their hand, and gain no spice for it.',
    cunning: 'You may discard any Treachery Card to use any Worthless Card special effect.',
    secretAlly:
      "You may either discard a Worthless Card and gain 2 spice during Spice Collection, or after winning a battle, you may look at a random card in your opponent's hand (not used in battle).",
  },
  {
    faction: 'Ecaz',
    symbol: 'ecaz',
    colors: ['#7F3D81', '#581858'],
    betrayal:
      "Any time before Shipment and Movement, if Ecaz and their ally both have troops in a territory, force the Ecaz ally to return their troops (from one territory that contains both factions' troops) to their reserves.",
    cunning:
      'Gain Duke Vidal for this turn (even if he is captured, in the Tleilaxu Tanks, or a ghola, overriding Moritani). At the end of this turn, set him aside normally.',
    secretAlly:
      'Force one player to reveal whether or not they have any of your leaders as Traitors (though not which leaders).',
  },
  {
    faction: 'Emperor',
    symbol: 'emperor',
    colors: ['#A82012', '#651808'],
    betrayal:
      "Force the Emperor to pay for their ally's Treachery Card during Bidding (at least as much spice as necessary) or, while making Battle Plans, prevent the Emperor from using their Sardaukar advantage.",
    cunning:
      'Before formulating your Battle Plan, you may count 5 of your troops as Sardaukar if you have none in that battle.',
    secretAlly:
      'Keep your spice when buying a Treachery Card (you must show that you have the amount you would have paid) or, revive 3 additional troops beyond Revival limits during Revival for free.',
  },
  {
    faction: 'Fremen',
    symbol: 'fremen',
    colors: ['#D3961B', '#946013'],
    betrayal:
      "Prevent Fremen from 'riding the worm' this turn, or prevent Fremen from moving 2 territories during Shipment and Movement.",
    cunning:
      "If Shai-Hulud appears in a territory with no troops, any troops you have in one sand territory may 'ride the worm' to any territory subject to storm and occupancy rules.",
    secretAlly:
      'You may either avoid losing troops to Shai-Hulud, or revive a total of 3 of your troops for free during Revival.',
  },
  {
    faction: 'Harkonnen',
    symbol: 'harkonnen',
    colors: ['#211F1C', '#050504'],
    betrayal:
      'Cancel a revealed Harkonnen traitor. Shuffle the traitor into the Traitor Deck, and then the Harkonnen player draws a new Traitor Card during the Mentat Pause.',
    cunning:
      'Draw a Traitor Card and add it to your hand at any time. Then secretly shuffle any one of your Traitor Cards back into the Traitor Deck.',
    secretAlly:
      'During the Mentat Pause, draw two Traitor Cards and add them to your hand. Then shuffle two Traitor Cards you hold back into the Traitor deck.',
  },
  {
    faction: 'Ixians',
    symbol: 'ixian',
    colors: ['#B6B568', '#666836'],
    betrayal: 'Prevent Ixians from using either their Bidding advantage or their Technology advantage (but not both).',
    cunning:
      'Before formulating your Battle Plan, you may count all of your Suboids in all battles this turn as counting full strength (without needing to support them with spice).',
    secretAlly:
      'You may discard a Treachery Card you just purchased during Bidding and then draw the top card of the Treachery deck.',
  },
  {
    faction: 'Moritani',
    symbol: 'moritani',
    colors: ['#1F6C78', '#073D48'],
    betrayal: 'Remove a Terror token from the board, returning it to Moritani. It is not revealed.',
    cunning:
      'When you place a Terror token, it may be placed in any territory on Arrakis, even one that already has a Terror token.',
    secretAlly:
      'When you lose a battle that had a winner, keep one Treachery Card you played in the battle you would have been able to keep had you won.',
  },
  {
    faction: 'Richese',
    symbol: 'richese',
    colors: ['#A39F8A', '#686652'],
    betrayal:
      'Force Richese to discard a Richese Treachery Card they were going to buy (it is discarded and no spice is paid), or prevent Richese from receiving payment on a card they sell (spice goes to the Spice Bank).',
    cunning:
      'You may use 2 No-Field tokens for a single shipment (still counting it as shipping 1 troop). Reveal one token immediately, to place in front of your shield.',
    secretAlly:
      'You may discard a Treachery Card you just purchased during Bidding and then draw the top card of the Treachery deck.',
  },
  {
    faction: 'Spacing Guild',
    symbol: 'guild',
    colors: ['#C95717', '#8C2D08'],
    betrayal:
      'Gain any one payment in full for Shipping that would have gone to either the Spacing Guild or the Spice Bank, even your own. This overrides collection from a faction occupying Junction.',
    cunning:
      'You may make a second Shipment immediately after performing your Shipment and Movement. The second Shipment does not get to move unless you play Hajr.',
    secretAlly:
      'Your shipment is at Guild rates, and you may also ship cross-planet or back to your reserves as your Shipping action.',
  },
  {
    faction: 'Tleilaxu',
    symbol: 'bene-tleilaxu',
    colors: ['#622B82', '#341547'],
    betrayal:
      'Cancel a revealed Face Dancer. It remains revealed until Tleilaxu have revealed all of their Face Dancers.',
    cunning:
      'Set aside all revealed Face Dancers. Secretly draw replacements and then shuffle the set-aside Face Dancers into the Traitor deck.',
    secretAlly: 'Revive one of your leaders for free and up to 5 of your troops for 1 spice each during Revival.',
  },
] as const;

export const GF9_NEXUS_CARDS: readonly z.infer<typeof NexusCardAsset>[] = effects.map(
  ({ faction, symbol, colors, ...rules }) => {
    const image = `/vector/logo/${symbol}.svg` as z.infer<typeof NexusCardAsset>['factionSymbol']['image'];
    const background: z.infer<typeof NexusCardAsset>['head'] = {
      ...NEXUS_HEAD,
      colors:
        faction === 'CHOAM'
          ? [
              {
                type: 'linear',
                angle: 270,
                stops: [
                  ['#EB0220', 0.5],
                  ['#252527', 0.5],
                ],
              },
              {
                type: 'linear',
                angle: 270,
                stops: [
                  ['#B90010', 0.5],
                  ['#0C0C0C', 0.5],
                ],
              },
            ]
          : [...colors],
    };
    return {
      name: faction,
      faction,
      subName: 'Nexus',
      about: 'GF9 Ecaz & Moritani Nexus card. Rules transcribed from the supplied 2022 original.',
      head: { ...NEXUS_HEAD, colors: [...NEXUS_HEAD.colors] },
      icon: [background, image],
      factionSymbol: { image, background },
      ...rules,
    };
  }
);

export const GF9_NEXUS_DECK: z.infer<typeof DeckAsset> = {
  name: 'GF9 Nexus Deck',
  about:
    "The twelve Nexus cards from GF9's Ecaz & Moritani expansion, one of each faction. Rules follow the supplied 2022 cards. The custom Nexus back is recreated for Dune Zone.",
  cardback: {
    mode: 'custom',
    name: 'Nexus',
    image: '/vector/icon/nexus.svg',
    imageOffset: [0, 0],
    imageScale: 0.55,
    background: { ...NEXUS_HEAD, colors: [...NEXUS_HEAD.colors] },
  },
};
