import { recalculateFactionComplexity } from '@shared/factions/complexity';
import { FactionInputSchema } from '@shared/factions/schema';
import type { FactionInput } from '@shared/factions/schema';

/*
 * Smugglers, a community faction by Argelius, as dune.zone stores it at /factions/smugglers, copied on 2026-10-17 for the post's closing picture.
 * Like House Atreides it is a copy rather than a live read, so the post stays as it was written; the rule text keeps the author's own wording.
 */
export const SMUGGLERS: FactionInput = FactionInputSchema.parse(
  recalculateFactionComplexity({
    name: 'Smugglers',
    logo: '/vector/generic/smugglers.svg',
    colors: ['Orange', 'Brown'],
    themeColor: '#f4641d',
    background: {
      image: '/image/texture/001.jpg',
      colors: ['#f4641d', '#713b17'],
      definition: 0.5,
      influence: 0.75,
      invert: true,
    },
    decals: [
      {
        id: '/vector/decal/orgiz-processing-station.svg',
        muted: false,
        offset: [64, 0],
        outline: false,
        scale: 0.5381,
      },
      { id: '/vector/generic/smugglers.svg', muted: true, offset: [0, 0], outline: false, scale: 1 },
    ],
    factionLeader: { name: 'Staban Tuek', image: '/image/leader/official/esmar.png' },
    leaders: [
      { name: 'Slave One', strength: 5, image: '/image/leader/ilya/cheap-hero.png' },
      { name: 'Kalaban Tuek', strength: 3, image: '/image/leader/custom/ron.png' },
      { name: 'Yoshiro Mefuem', strength: 3, image: '/image/leader/custom/huelab.png' },
      { name: 'Vis', strength: 2, image: '/image/leader/custom/vis.png' },
      { name: 'Pliskin', strength: 1, image: '/image/leader/custom/jack.png' },
    ],
    troops: [
      {
        name: 'Troop',
        count: 20,
        description: 'Troop',
        image: '/vector/troop/smuggler.svg',
        combat: { strength: 1, supportedStrength: 1 },
      },
    ],
    rules: {
      spiceCount: 5,
      startText:
        '5 Troops in any Rock Territory (chosen after Fremen but before Bene Gesserit), 15 in reserve. Start with 5 Dirty Spice',
      revivalText: '1 Free Revival.',
      advantages: [
        {
          title: 'Smuggled Spice',
          text: 'Spice in front of Player Shields is called Dirty Spice, while Spice behind Shields is considered Clean Spice. All players may Bribe using Dirty Spice.\n\nWhen another player makes a Payment to the Spice Bank or Cleans their Spice, 1 of that Spice goes to your Dirty Spice instead (Shipping and Reviving are bulk payments).',
        },
        {
          title: 'Off-Market',
          text: "You may make payments using Smuggled Spice by paying 2 additional Spice (Spice paid to other players this way remains Dirty).\n\nYou may sponsor other Player's bids, revivals, and shipments (using only Dirty Spice).",
        },
        {
          title: 'Secondary Market',
          text: 'At the end of the Bidding Phase, choose a player to draw a Treachery Card. If you pick yourself, give 1 of your Dirty Spice to each other player (you cannot choose yourself if you cannot afford to pay).',
        },
        {
          title: 'Stowaways',
          text: 'When another player Ships at least one force from Reserves, you may ship one Troop (for free) to a Rock Territory where you already have Troops or that has a Smuggler Icon.',
        },
        {
          title: 'Unlicensed Harvesters',
          text: 'You may skip your Shipping to Move an additional time. Your Troops move 2 Territories.\n\nAt the end of the Shipment & Movement Phase, add 2 Spice from the Spice Bank to every Sand Territory with no Spice that contains your Troops.\n\nSpice you harvest becomes Dirty.',
          karama: 'Reduce movement to 1 Territory.',
        },
        {
          title: 'Illicit',
          text: 'You do not clean your Spice at the start of the Mentat Pause Phase.\n\nDuring the Mentat Pause Phase, other players may give you Clean Spice to get any amount of Dirty Spice in return (as long as both players agree).',
        },
        {
          title: 'Standby',
          text: 'You may look at Smuggler Tokens at any time. If the Spacing Guild and Fremen are not in the game, you inherit the Spacing Guild Win Condition.',
        },
      ],
      alliance: {
        text: 'Smugglers may let you Stowaway, placing your Troops shipped this way in any Rock Territory with a Smuggler Icon.',
      },
      fate: { text: 'When another player cleans their spice, place it in your Clean Spice instead of theirs.' },
    },
  })
);
