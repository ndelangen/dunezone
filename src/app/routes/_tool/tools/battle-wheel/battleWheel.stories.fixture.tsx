import { useState } from 'react';

import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';

import type { FactionChoice, WheelFaction, WheelRuleset } from './battleWheel';
import { BattleWheelTool } from './BattleWheelTool';
import type { FactionSearch } from './BattleWheelTool';
import type { WheelState } from './useBattleWheel';

/*
 * Story data for the battle wheel prototypes: GF9's base factions plus the Ixians and Tleilaxu, copied from content/gf9.
 * The tool itself will read factions and each Ruleset's battle dialing from the catalogue.
 */
export const STORY_FACTIONS: readonly WheelFaction[] = [
  {
    id: 'atreides',
    name: 'Atreides',
    emblem: '/vector/emblem/atreides.svg',
    background: {
      image: '/image/texture/082.jpg',
      colors: ['#393d05', '#5c5d10'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    leaders: [
      {
        id: 'atreides-0',
        name: 'Lady Jessica',
        strength: 5,
        image: '/image/leader/official/jessica.png',
      },
      {
        id: 'atreides-1',
        name: 'Thufir Hawat',
        strength: 5,
        image: '/image/leader/official/thufir.png',
      },
      {
        id: 'atreides-2',
        name: 'Gurney Halleck',
        strength: 4,
        image: '/image/leader/official/gurney.png',
      },
      {
        id: 'atreides-3',
        name: 'Duncan Idaho',
        strength: 2,
        image: '/image/leader/official/duncan.png',
      },
      {
        id: 'atreides-4',
        name: 'Doctor Yueh',
        strength: 1,
        image: '/image/leader/official/dryeuh.png',
      },
    ],
    faces: [
      {
        id: 'atreides-0',
        name: 'Normal troop',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 20,
        image: '/vector/troop/atreides.svg',
      },
    ],
  },
  {
    id: 'harkonnen',
    name: 'Harkonnen',
    emblem: '/vector/emblem/harkonnen.svg',
    background: {
      image: '/image/texture/026.jpg',
      colors: ['#0a080b', '#363636'],
      invert: false,
      definition: 0.1,
      influence: 1,
    },
    leaders: [
      {
        id: 'harkonnen-0',
        name: 'Feyd-Rautha',
        strength: 6,
        image: '/image/leader/official/feyd.png',
      },
      {
        id: 'harkonnen-1',
        name: 'Beast Rabban',
        strength: 4,
        image: '/image/leader/official/beast.png',
      },
      {
        id: 'harkonnen-2',
        name: 'Piter De Vries',
        strength: 3,
        image: '/image/leader/official/piter.png',
      },
      {
        id: 'harkonnen-3',
        name: 'Captain Iakin Nefud',
        strength: 2,
        image: '/image/leader/official/nafud.png',
      },
      {
        id: 'harkonnen-4',
        name: 'Umman Kudu',
        strength: 1,
        image: '/image/leader/official/uman.png',
      },
    ],
    faces: [
      {
        id: 'harkonnen-0',
        name: 'Harkonnen Troop',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 20,
        image: '/vector/troop/harkonnen.svg',
      },
    ],
  },
  {
    id: 'emperor',
    name: 'Emperor',
    emblem: '/vector/emblem/emperor.svg',
    background: {
      image: '/image/texture/055.jpg',
      colors: ['#8C0402', '#db1918'],
      invert: false,
      definition: 0.31,
      influence: 1,
    },
    leaders: [
      {
        id: 'emperor-0',
        name: 'Hasimir Fenring',
        strength: 6,
        image: '/image/leader/official/hasimir.png',
      },
      {
        id: 'emperor-1',
        name: 'Cpt. Aramsham',
        strength: 5,
        image: '/image/leader/official/aramsham.png',
      },
      {
        id: 'emperor-2',
        name: 'Caid',
        strength: 3,
        image: '/image/leader/official/caid.png',
      },
      {
        id: 'emperor-3',
        name: 'Burseg',
        strength: 3,
        image: '/image/leader/official/burseg.png',
      },
      {
        id: 'emperor-4',
        name: 'Bashar',
        strength: 2,
        image: '/image/leader/official/bashar.png',
      },
    ],
    faces: [
      {
        id: 'emperor-0',
        name: 'Normal troop',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 15,
        image: '/vector/troop/emperor.svg',
      },
      {
        id: 'emperor-1',
        name: 'Sardaukar',
        capable: true,
        strength: 1,
        supportedStrength: 2,
        supportCost: 1,
        count: 5,
        image: '/vector/troop/emperor.svg',
        star: '/vector/troop_modifier/star-right.svg',
        hue: '#e6de12',
      },
    ],
  },
  {
    id: 'spacing-guild',
    name: 'Spacing Guild',
    emblem: '/vector/emblem/guild.svg',
    background: {
      image: '/image/texture/006.jpg',
      colors: ['#bd3108', '#e05719'],
      invert: false,
      definition: 0.2,
      influence: 1,
    },
    leaders: [
      {
        id: 'spacing-guild-0',
        name: 'Staban Tuek',
        strength: 5,
        image: '/image/leader/official/staban.png',
      },
      {
        id: 'spacing-guild-1',
        name: 'Esmar Tuek',
        strength: 3,
        image: '/image/leader/official/esmar.png',
      },
      {
        id: 'spacing-guild-2',
        name: 'Master Bewt',
        strength: 3,
        image: '/image/leader/official/bewt.png',
      },
      {
        id: 'spacing-guild-3',
        name: 'Soo Soo Sook',
        strength: 2,
        image: '/image/leader/official/soo-soo-sook.png',
      },
      {
        id: 'spacing-guild-4',
        name: 'Guild Rep.',
        strength: 1,
        image: '/image/leader/official/guildrep.png',
      },
    ],
    faces: [
      {
        id: 'spacing-guild-0',
        name: 'Troop',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 20,
        image: '/vector/troop/guild.svg',
        hue: '#ffffff',
      },
    ],
  },
  {
    id: 'fremen',
    name: 'Fremen',
    emblem: '/vector/emblem/fremen.svg',
    background: {
      image: '/image/texture/019.jpg',
      colors: ['#fcb843', '#d2781d'],
      invert: false,
      definition: 0.3,
      influence: 0.634,
    },
    leaders: [
      {
        id: 'fremen-0',
        name: 'Stilgar',
        strength: 7,
        image: '/image/leader/official/stilgar.png',
      },
      {
        id: 'fremen-1',
        name: 'Chani',
        strength: 6,
        image: '/image/leader/official/chani.png',
      },
      {
        id: 'fremen-2',
        name: 'Otheym',
        strength: 5,
        image: '/image/leader/official/otheym.png',
      },
      {
        id: 'fremen-3',
        name: 'Shaddout Mapes',
        strength: 3,
        image: '/image/leader/official/mapes.png',
      },
      {
        id: 'fremen-4',
        name: 'Jamis',
        strength: 2,
        image: '/image/leader/official/jamis.png',
      },
    ],
    faces: [
      {
        id: 'fremen-0',
        name: 'Normal troop',
        capable: true,
        strength: 1,
        supportedStrength: 1,
        supportCost: 0,
        count: 17,
        image: '/vector/troop/fremen.svg',
      },
      {
        id: 'fremen-1',
        name: 'Fedaykin',
        capable: true,
        strength: 2,
        supportedStrength: 2,
        supportCost: 0,
        count: 3,
        image: '/vector/troop/fremen.svg',
        star: '/vector/troop_modifier/star-right.svg',
        hue: '#edecd5',
      },
    ],
  },
  {
    id: 'bene-gesserit',
    name: 'Bene Gesserit',
    emblem: '/vector/emblem/bene-gesserit.svg',
    background: {
      image: '/image/texture/019.jpg',
      colors: ['#132b74', '#34478b'],
      invert: false,
      definition: 0.09,
      influence: 0.8878,
    },
    leaders: [
      {
        id: 'bene-gesserit-0',
        name: 'Alia',
        strength: 5,
        image: '/image/leader/official/alia.png',
      },
      {
        id: 'bene-gesserit-1',
        name: 'Princess Irulan',
        strength: 5,
        image: '/image/leader/official/irulan.png',
      },
      {
        id: 'bene-gesserit-2',
        name: 'Mother Ramallo',
        strength: 5,
        image: '/image/leader/official/ramallo.png',
      },
      {
        id: 'bene-gesserit-3',
        name: 'Wanna Yueh',
        strength: 5,
        image: '/image/leader/official/wanna.png',
      },
      {
        id: 'bene-gesserit-4',
        name: 'Margot Lady Fenring',
        strength: 5,
        image: '/image/leader/official/lady-fenring.png',
      },
    ],
    faces: [
      {
        id: 'bene-gesserit-0',
        name: 'Fighter',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 20,
        image: '/vector/troop/bene-gesserit.svg',
      },
    ],
  },
  {
    id: 'ixians',
    name: 'Ixians',
    emblem: '/vector/emblem/ixian.svg',
    background: {
      image: '/image/texture/082.jpg',
      colors: ['#A8A172', '#A8A172'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    leaders: [
      {
        id: 'ixians-0',
        name: 'Dominic Vernius',
        strength: 4,
        image: '/image/leader/official/dominic.png',
      },
      {
        id: 'ixians-1',
        name: "C'Tair Pilru",
        strength: 5,
        image: '/image/leader/official/ctair.png',
      },
      {
        id: 'ixians-2',
        name: 'Tessia Vernius',
        strength: 5,
        image: '/image/leader/official/tessia.png',
      },
      {
        id: 'ixians-3',
        name: 'Kailea Vernius',
        strength: 2,
        image: '/image/leader/official/kailea.png',
      },
      {
        id: 'ixians-4',
        name: 'Cammar Pilru',
        strength: 1,
        image: '/image/leader/official/cammar.png',
      },
    ],
    faces: [
      {
        id: 'ixians-0',
        name: 'Cyborg',
        capable: true,
        strength: 1,
        supportedStrength: 2,
        supportCost: 1,
        count: 7,
        image: '/vector/troop/ixian.svg',
      },
      {
        id: 'ixians-1',
        name: 'Suboid',
        capable: true,
        strength: 0.5,
        supportedStrength: 0.5,
        supportCost: 0,
        count: 13,
        image: '/vector/troop/ixian-engineer.svg',
      },
    ],
  },
  {
    id: 'tleilaxu',
    name: 'Tleilaxu',
    emblem: '/vector/emblem/bene-tleilaxu.svg',
    background: {
      image: '/image/texture/082.jpg',
      colors: ['#6A1B8E', '#6A1B8E'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    leaders: [
      {
        id: 'tleilaxu-0',
        name: 'Zoal',
        strength: null,
        image: '/image/leader/official/zoal.png',
      },
      {
        id: 'tleilaxu-1',
        name: 'Hidar Fen Ajidica',
        strength: 4,
        image: '/image/leader/official/hidar.png',
      },
      {
        id: 'tleilaxu-2',
        name: 'Master Zaaf',
        strength: 3,
        image: '/image/leader/official/zaaf.png',
      },
      {
        id: 'tleilaxu-3',
        name: 'Wykk',
        strength: 2,
        image: '/image/leader/official/wykk.png',
      },
      {
        id: 'tleilaxu-4',
        name: 'Blin',
        strength: 1,
        image: '/image/leader/official/blin.png',
      },
    ],
    faces: [
      {
        id: 'tleilaxu-0',
        name: 'Tleilaxu troop',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 20,
        image: '/vector/troop/bene-tleilaxu.svg',
      },
    ],
  },
  {
    id: 'richese',
    name: 'Richese',
    emblem: '/vector/emblem/richese.svg',
    background: {
      image: '/image/texture/082.jpg',
      colors: ['#B7B6A9', '#B7B6A9'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    leaders: [
      {
        id: 'richese-0',
        name: 'Premier Ein Calimar',
        strength: 5,
        image: '/image/leader/official/ein-calimar.png',
      },
      {
        id: 'richese-1',
        name: 'Lady Helena',
        strength: 4,
        image: '/image/leader/official/lady-helena.png',
      },
      {
        id: 'richese-2',
        name: 'Flinto Kinnis',
        strength: 3,
        image: '/image/leader/official/flinto-kinnis.png',
      },
      {
        id: 'richese-3',
        name: 'Haloa Rund',
        strength: 2,
        image: '/image/leader/official/haloa-rund.png',
      },
      {
        id: 'richese-4',
        name: 'Talis Balt',
        strength: 2,
        image: '/image/leader/official/talis-balt.png',
      },
    ],
    faces: [
      {
        id: 'richese-0',
        name: 'Richese troop',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 20,
        image: '/vector/troop/richese.svg',
      },
    ],
  },
  {
    id: 'choam',
    name: 'CHOAM',
    emblem: '/vector/emblem/choam.svg',
    background: {
      image: '/image/texture/082.jpg',
      colors: ['#B11B20', '#B11B20'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    leaders: [
      {
        id: 'choam-0',
        name: 'Frankos Aru',
        strength: 4,
        image: '/image/leader/official/frankos-aru.png',
      },
      {
        id: 'choam-1',
        name: 'Lady Jalma',
        strength: 4,
        image: '/image/leader/official/lady-yalma.png',
      },
      {
        id: 'choam-2',
        name: 'Rajiv Londine',
        strength: 3,
        image: '/image/leader/official/rajiv-londine.png',
      },
      {
        id: 'choam-3',
        name: 'Duke Verdun',
        strength: 3,
        image: '/image/leader/official/duke-verdun.png',
      },
      {
        id: 'choam-4',
        name: 'Viscount Tull',
        strength: 2,
        image: '/image/leader/official/viscount-tull.png',
      },
      {
        id: 'choam-5',
        name: 'Auditor',
        strength: 2,
        image: '/image/leader/official/auditor.png',
      },
    ],
    faces: [
      {
        id: 'choam-0',
        name: 'CHOAM troop',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 20,
        image: '/vector/troop/choam.svg',
      },
    ],
  },
  {
    id: 'ecaz',
    name: 'Ecaz',
    emblem: '/vector/emblem/ecaz.svg',
    background: {
      image: '/image/texture/082.jpg',
      colors: ['#8B3C8C', '#8B3C8C'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    leaders: [
      {
        id: 'ecaz-0',
        name: 'Sanya Ecaz',
        strength: 4,
        image: '/image/leader/official/sanya-ecaz.png',
      },
      {
        id: 'ecaz-1',
        name: 'Whitmore Bludd',
        strength: 4,
        image: '/image/leader/official/whitemore-bludd.png',
      },
      {
        id: 'ecaz-2',
        name: 'Ilesa Ecaz',
        strength: 3,
        image: '/image/leader/official/ilesa-ecaz.png',
      },
      {
        id: 'ecaz-3',
        name: 'Rivvy Dinari',
        strength: 3,
        image: '/image/leader/brainfood/rivvy-dinari.png',
      },
      {
        id: 'ecaz-4',
        name: 'Bindikk Narvi',
        strength: 2,
        image: '/image/leader/official/bindikk-narvi.png',
      },
    ],
    faces: [
      {
        id: 'ecaz-0',
        name: 'Ecaz troop',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 20,
        image: '/vector/troop/ecaz.svg',
      },
    ],
  },
  {
    id: 'moritani',
    name: 'Moritani',
    emblem: '/vector/emblem/moritani.svg',
    background: {
      image: '/image/texture/082.jpg',
      colors: ['#3C8798', '#3C8798'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    leaders: [
      {
        id: 'moritani-0',
        name: 'Lupino Ord',
        strength: 5,
        image: '/image/leader/official/lupino-ord.png',
      },
      {
        id: 'moritani-1',
        name: 'Grieu Kronos',
        strength: 4,
        image: '/image/leader/official/grieu-kronos.png',
      },
      {
        id: 'moritani-2',
        name: 'Hiih Resser',
        strength: 4,
        image: '/image/leader/official/hiih-resser.png',
      },
      {
        id: 'moritani-3',
        name: 'Trin Kronos',
        strength: 2,
        image: '/image/leader/official/trin-kronos.png',
      },
      {
        id: 'moritani-4',
        name: 'Vando Terboli',
        strength: 1,
        image: '/image/leader/official/vando-terboli.png',
      },
    ],
    faces: [
      {
        id: 'moritani-0',
        name: 'Moritani troop',
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
        count: 20,
        image: '/vector/troop/moritani.svg',
      },
    ],
  },
];

export const STORY_RULESETS: readonly WheelRuleset[] = [
  { id: 'gf9', name: 'GF9', dialing: 'advanced' },
  { id: 'gf9-basic', name: 'GF9 basic game', dialing: 'basic' },
  { id: 'kiss', name: 'KISS', dialing: 'kiss' },
  { id: 'gf9-2-0', name: 'GF9 2.0', dialing: 'gf92' },
];

export const storyFaction = (id: string) => STORY_FACTIONS.find((candidate) => candidate.id === id)!;

/* The base game's six come first; search reaches every faction on Dune Zone. */
const STARTING: readonly FactionChoice[] = STORY_FACTIONS.slice(0, 6);
const PUBLISHED_TOKEN: Readonly<Record<string, string>> = {
  atreides: 'house-atreides',
  harkonnen: 'house-harkonnen',
  emperor: 'emperor',
  'spacing-guild': 'spacing-guild',
  fremen: 'fremen',
  'bene-gesserit': 'bene-gesserit',
};
const TOKENS: readonly FactionToken[] = STORY_FACTIONS.map((known) => ({
  id: known.id,
  name: known.name,
  src: PUBLISHED_TOKEN[known.id] && `/play-fixtures/product/${PUBLISHED_TOKEN[known.id]}-token.jpg`,
}));

const StorySearch: FactionSearch = ({ seated, onPick }) => {
  const [query, setQuery] = useState('');
  const found = TOKENS.filter((token) => token.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={found}
      seated={seated}
      status="done"
      onMore={() => undefined}
      onPick={onPick}
    />
  );
};

const loadStoryFaction = async (picked: Readonly<{ id: string }>) => storyFaction(picked.id);

export function StoryWheel({ name, initial }: Readonly<{ name: string; initial?: WheelState }>) {
  return (
    <BattleWheelTool
      storageKey={`battle-wheel-story-${name}`}
      initial={initial}
      rulesets={STORY_RULESETS}
      defaultRulesetId="gf9"
      factions={STARTING}
      search={StorySearch}
      loadFaction={loadStoryFaction}
    />
  );
}
