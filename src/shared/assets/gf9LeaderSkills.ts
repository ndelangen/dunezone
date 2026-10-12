import type { z } from 'zod';

import type { LeaderSkillAsset, DeckAsset, CardBack } from './schema';

/** GF9 CHOAM & Richese cards, transcribed from the original fourteen card scans. */
const SKILLS = [
  {
    name: 'Bureaucrat',
    generalText:
      'Once per phase, if another player makes a payment to any player other than you of at least 5 spice, you may force two of the spice to go to the Spice Bank.',
    battleText:
      'Your opponent subtracts 1 from their Battle total for each Stronghold they occupy (not counting those occupied by advisors).',
    decal: '/vector/decal/beaurocrat-multicolor.svg',
  },
  {
    name: 'Diplomat',
    generalText:
      'You may count one Worthless card in your Battle Plan as the defense your opponent used in that battle, provided you played no defense. Discard it afterward.',
    battleText:
      'A number of your undialed forces up to the strength of this leader may retreat to an empty adjacent non-stronghold territory if you lose the battle.',
    decal: '/vector/decal/diplomat-multicolor.svg',
  },
  {
    name: 'Killer Medic',
    generalText: 'Add a +1 to your other leader discs when using a Poison Defense.',
    battleText: 'Add a +3 to your leader disc when using a Poison Defense.',
    decal: '/vector/decal/killer-doctor-multicolor.svg',
  },
  {
    name: 'Master of Assassins',
    generalText: 'Add a +1 to your other leader discs when using a Poison Weapon.',
    battleText: 'Add a +3 to this leader disc when using a Poison Weapon.',
    decal: '/vector/decal/master-of-assassins-multicolor.svg',
  },
  {
    name: 'Mentat',
    generalText:
      "Before making Battle Plans, you may ask your opponent if they have a specific weapon (e.g., Crysknife or Poison Tooth) in hand. They must show you that card if they have it, or another Treachery Card if they don't. They are not required to use the weapon.",
    battleText: 'Add +2 to this leader disc.',
    decal: '/vector/decal/mentat.svg',
  },
  {
    name: 'Planetologist',
    generalText:
      'Add 1 to your movement (to a maximum of 3), OR you may move forces from two different territories in a single movement if they have the same destination.',
    battleText:
      'Reveal one green Special card (other than a Cheap Hero), e.g. Hajr or Thumper, as part of your Battle Plan in place of a weapon, and add +2 to this leader disc. Discard it after the battle.',
    decal: '/vector/decal/planetologist-scene.svg',
  },
  {
    name: 'Prana Bindu Adept',
    generalText: 'Add a +1 to your other leader discs when using a Projectile Defense.',
    battleText: 'Add a +3 to this leader disc when using a Projectile Defense.',
    decal: '/vector/decal/prana-bundu-detailed.svg',
  },
  {
    name: 'Rihani Decipherer',
    generalText: 'If you win a battle, secretly peek at 2 random cards in the Traitor Deck, then reshuffle it.',
    battleText:
      'If you win the battle, you may draw 2 Traitor Cards from the deck. Keep one card by revealing an unused Traitor Card you hold and then shuffling it and the other card you drew back into the deck.',
    decal: '/vector/decal/rihani-decipherer-multicolor.svg',
  },
  {
    name: 'Sandmaster',
    generalText:
      'If you move any number of your forces into or through a territory containing spice, you may immediately collect 1 spice from that territory (once per territory).',
    battleText: 'Add 3 more spice to a territory you are in that has spice, after winning a battle there.',
    decal: '/vector/decal/sandmaster-multicolor.svg',
  },
  {
    name: 'Smuggler',
    generalText:
      'Whenever you ship forces from off-planet to an empty territory, you may bring one additional force for free.',
    battleText:
      'Collect 1 spice for each point of strength of this leader from the territory this battle is in (if spice is present) when Battle Plans are revealed.',
    decal: '/vector/decal/smuggler-alt-multicolor.svg',
  },
  {
    name: 'Spice Banker',
    generalText:
      'Once per phase, if another player makes a payment to the Spice Bank of at least 4 spice, you gain 1 spice, placing it in front of your shield and collecting it in the Mentat Pause.',
    battleText:
      'You may spend 1-3 of your spice as part of your Battle Plan and add that amount to your leader disc. This is separate from any spice paid to count your forces as full strength.',
    decal: '/vector/decal/spice-banker-multicolor.svg',
  },
  {
    name: 'Suk Graduate',
    generalText:
      'When you win a battle and lose forces, return 1 to your reserves instead of going to the Tleilaxu Tanks.',
    battleText:
      'When you win a battle and lose forces, you may save up to 3 of them from going to the Tleilaxu Tanks, leaving 1 of them in the territory and returning the rest to your reserves.',
    decal: '/vector/decal/suk-graduate.svg',
  },
  {
    name: 'Swordmaster of Ginaz',
    generalText: 'Add a +1 to your other leader discs when using a Projectile Weapon.',
    battleText: 'Add +3 to this leader disc when using a Projectile Weapon.',
    decal: '/vector/decal/swordmaster-of-ginaz-multicolor.svg',
  },
  {
    name: 'Warmaster',
    generalText:
      'Add +1 to your other leader discs when you play at least one Worthless card as part of your battle plan.',
    battleText: 'Add +3 to this leader disc if you play at least one Worthless card as part of your battle plan.',
    decal: '/vector/decal/warmaster-multicolor.svg',
  },
] as const;

export const LEADER_SKILL_HEAD: z.infer<typeof LeaderSkillAsset>['head'] = {
  image: '/image/texture/082.jpg',
  colors: ['#6B328E', '#421760'],
  influence: 0.5,
  invert: false,
  definition: 1,
};
export const LEADER_SKILL_SYMBOL: z.infer<typeof LeaderSkillAsset>['icon'] = [
  { image: '/image/texture/076.jpg', colors: ['#D5AE3A', '#F3E086'], influence: 0.4, invert: false, definition: 1 },
  '/vector/generic/star.svg',
];

export const GF9_LEADER_SKILLS: z.infer<typeof LeaderSkillAsset>[] = SKILLS.map(
  ({ name, generalText, battleText, decal }) => ({
    name,
    generalText,
    battleText,
    about: 'GF9 CHOAM & Richese expansion. Leader skill rules from the original printed card.',
    subName: 'Leader skill',
    head: LEADER_SKILL_HEAD,
    icon: LEADER_SKILL_SYMBOL,
    textSize: 36,
    decals: [{ id: decal, scale: 1.05, offset: [0, 0], muted: false, outline: true }],
  })
);

export const GF9_LEADER_SKILL_DECK_BACK = {
  name: 'Leader skills',
  background: LEADER_SKILL_HEAD,
  image: '/vector/generic/leader-skills.svg',
  imageOffset: [0, 10],
  imageScale: 0.9,
} satisfies z.infer<typeof CardBack>;

export const GF9_LEADER_SKILL_DECK: z.infer<typeof DeckAsset> = {
  name: 'GF9 Leader Skill Deck',
  about:
    "The fourteen leader skill cards from GF9's CHOAM & Richese expansion, one copy of each. At setup, deal two to each player, keep one and shuffle the other back into the deck.",
  cardback: { mode: 'custom', ...GF9_LEADER_SKILL_DECK_BACK },
};
