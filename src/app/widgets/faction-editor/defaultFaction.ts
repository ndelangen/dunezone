import type { Faction } from '@db/factions';
import { LEADERS, LOGO, TROOP } from '@game/data/generated';
import { FactionInputSchema } from '@game/schema/faction';

const defaultFactionInput = {
  name: 'New faction',
  logo: LOGO.options[0],
  colors: ['Green', 'Teal'],
  background: {
    image: '/image/texture/021.jpg',
    colors: ['#444444', '#222222'],
    invert: true,
    definition: 0.5,
    influence: 1,
  },
  themeColor: '#444444',
  hero: {
    name: 'Hero',
    image: LEADERS.options[0],
  },
  leaders: [
    {
      name: 'Leader',
      strength: '2',
      image: LEADERS.options[0],
    },
  ],
  decals: [],
  planet: [],
  troops: [
    {
      name: 'Troop',
      image: TROOP.options[0],
      description: 'Troop',
      count: 20,
    },
  ],
  rules: {
    startText: 'Starting rules text.',
    revivalText: 'Revival rules text.',
    spiceCount: 10,
    advantages: [],
    alliance: {
      text: 'Alliance rules text.',
    },
    fate: {
      title: 'Fate',
      text: 'Fate rules text.',
    },
  },
} satisfies Faction;

/** Valid starter document for the faction editor (create + reset). */
export const defaultFaction: Faction = FactionInputSchema.parse(defaultFactionInput);
