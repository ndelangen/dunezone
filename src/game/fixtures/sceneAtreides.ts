import type { FactionInput } from '@game/schema/faction';

/** Valid `FactionInput` sample for Scene and similar stories. */
export default {
  name: 'Atreides',
  logo: '/vector/logo/atreides.svg',
  colors: ['Green', 'Teal', 'Brown', 'Yellow'],
  background: {
    image: '/image/texture/021.jpg',
    colors: ['#ffff00', '#0000ff'],
    invert: true,
    definition: 0.5,
    influence: 1,
  },
  themeColor: '#008000',
  hero: {
    name: 'Duke Leto Atreides',
    image: '/image/leader/official/paul.jpg',
  },
  leaders: [
    {
      name: 'Dr. Yueh',
      strength: '1',
      image: '/image/leader/official/dryeuh.png',
    },
    {
      name: 'Duncan Idaho',
      strength: '2',
      image: '/image/leader/official/duncan.png',
    },
    {
      name: 'Gurney Halleck',
      strength: '4',
      image: '/image/leader/official/gurney.png',
    },
    {
      name: 'Thufir Hawat',
      strength: '5',
      image: '/image/leader/official/thufir.png',
    },
    {
      name: 'Lady Jessica',
      strength: '5',
      image: '/image/leader/official/jessica.png',
    },
  ],
  decals: [],
  planet: [],
  troops: [
    {
      name: 'Normal troop',
      image: '/vector/troop/atreides.svg',
      description: 'Normal troop',
      count: 20,
    },
  ],
  rules: {
    startText: 'Start the game with 10 spice.',
    revivalText: 'Revive 1 force for free.',
    spiceCount: 10,
    advantages: [],
    alliance: {
      text: "Atreides may use Battle Prescience in their ally's battles.",
    },
    fate: {
      title: 'Fate',
      text: 'Fate',
    },
  },
} satisfies FactionInput;
