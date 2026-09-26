import type { Background } from '@shared/factions/schema';
import { CanonicalFactionStoredSchema } from '@shared/factions/schema';
import { emptySnapshot } from '@shared/play/commands';
import type { DraftFaction, DraftState } from '@shared/play/drafting';
import type { PublicControls } from '@shared/play/inventory';
import { emptyPublicControls } from '@shared/play/inventory';
import type { GameSnapshot } from '@shared/play/protocol';
import type { TableSeatCount } from '@shared/play/tableSettings';
import type { ComponentProps } from 'react';
import type { z } from 'zod';

import type { Token } from '@game/assets/faction/token/Token';

import capturedFactions from './product.stories.fixture/factions.json';

/*
 * Real data for the Play page stories, per Norbert's rule that a page story shows a complete game state on real data.
 * The six product factions are the public catalogue copies from 2026-09-21 in `factions.json`.
 * The drafting catalogue's other 13 factions were read from production through the public query API on 2026-09-12, with test rows and jokes left out.
 * The eight profiles are real public profiles with their avatars.
 * All of it is a display-only snapshot the catalogue may since have moved past.
 */

/**
 * The six product factions of the Play page stories, each definition parsed against the stored schema.
 * See the fixture provenance beside the JSON.
 */
export const factions = capturedFactions.map((entry) => ({
  ...entry,
  data: CanonicalFactionStoredSchema.parse(entry.data),
}));

type CatalogueSnapshotEntry = {
  slug: string;
  name: string;
  logo: ComponentProps<typeof Token>['logo'];
  background: z.infer<typeof Background>;
  themeColor: string;
  rulesets: string[];
  published: boolean;
};

const OTHER_FACTIONS: readonly CatalogueSnapshotEntry[] = [
  {
    slug: 'ixians',
    name: 'Ixians',
    logo: '/vector/logo/ixian.svg',
    background: {
      image: '/image/texture/022.jpg',
      colors: ['#b29b54', '#d1be82'],
      invert: true,
      definition: 0.25,
      influence: 0.9008,
    },
    themeColor: '#c1ab69',
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'bene-tleilax',
    name: 'Bene Tleilax',
    logo: '/vector/logo/bene-tleilaxu.svg',
    background: {
      image: '/image/texture/073.jpg',
      colors: ['#3c0a78', '#741890'],
      invert: true,
      definition: 0.61,
      influence: 1,
    },
    themeColor: '#410c7a',
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'iduali',
    name: 'Iduali',
    logo: '/vector/logo/iduali.svg',
    background: {
      image: '/image/texture/082.jpg',
      colors: ['#663b01', '#3e2400'],
      invert: false,
      definition: 1,
      influence: 0.8704,
    },
    themeColor: '#663b01',
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'ecaz-ecaz-moritani',
    name: 'Ecaz (Ecaz/Moritani)',
    logo: '/vector/logo/ecaz.svg',
    background: {
      image: '/image/texture/021.jpg',
      colors: [
        '#cd49c0',
        {
          type: 'radial',
          stops: [
            ['#b818a8', 0],
            ['#b818a8', 0.4],
            ['#ff4885', 0.6],
            ['#ff4885', 1],
          ],
        },
      ],
      invert: false,
      definition: 1,
      influence: 1,
    },
    themeColor: '#cd49c0',
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'moritani-ecaz-moritani',
    name: 'Moritani (Ecaz/Moritani)',
    logo: '/vector/logo/moritani.svg',
    background: {
      image: '/image/texture/030.jpg',
      colors: [
        '#56cee3',
        {
          type: 'linear',
          angle: 270,
          stops: [
            ['#3e9aab', 0],
            ['#5cdff7', 1],
          ],
        },
      ],
      invert: false,
      definition: 1,
      influence: 1,
    },
    themeColor: '#56cee3',
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'richese',
    name: 'Richese',
    logo: '/vector/logo/richese.svg',
    background: {
      image: '/image/texture/021.jpg',
      colors: ['#e8e8e8', '#5e5e5e'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    themeColor: '#757575',
    rulesets: [],
    published: true,
  },
  {
    slug: 'ginaz',
    name: 'Ginaz',
    logo: '/vector/logo/ginaz.svg',
    background: {
      image: '/image/texture/022.jpg',
      colors: ['#009080', '#004D40'],
      invert: true,
      definition: 0,
      influence: 0.2518,
    },
    themeColor: '#009080',
    rulesets: [],
    published: true,
  },
  {
    slug: 'landsraad-council',
    name: 'Landsraad Council',
    logo: '/vector/generic/council.svg',
    background: {
      image: '/image/texture/001.jpg',
      colors: ['#444444', '#222222'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    themeColor: '#6e6464',
    rulesets: [],
    published: true,
  },
  {
    slug: 'choam',
    name: 'CHOAM',
    logo: '/vector/generic/guildeyes.svg',
    background: {
      image: '/image/texture/021.jpg',
      colors: ['#5f0000', '#5f0000'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    themeColor: '#5f0000',
    rulesets: [],
    published: true,
  },
  {
    slug: 'honored-matres',
    name: 'Honored Matres',
    logo: '/vector/generic/matres.svg',
    background: {
      image: '/image/texture/021.jpg',
      colors: [
        {
          type: 'radial',
          stops: [
            ['#ff4000', 0],
            ['#444444', 1],
          ],
        },
        '#222222',
      ],
      invert: true,
      definition: 0.76,
      influence: 1,
    },
    themeColor: '#913414',
    rulesets: [],
    published: true,
  },
  {
    slug: 'ordos',
    name: 'Ordos',
    logo: '/vector/generic/tech.svg',
    background: {
      image: '/image/texture/021.jpg',
      colors: ['#004020', '#222222'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    themeColor: '#004020',
    rulesets: [],
    published: true,
  },
  {
    slug: 'thinking-machines',
    name: 'Thinking Machines',
    logo: '/vector/generic/detector.svg',
    background: {
      image: '/image/texture/021.jpg',
      colors: ['#808080', '#222222'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    themeColor: '#808080',
    rulesets: [],
    published: true,
  },
  {
    slug: 'corrino',
    name: 'Corrino',
    logo: '/vector/generic/flauqre.svg',
    background: {
      image: '/image/texture/021.jpg',
      colors: ['#ff08b2', '#ff08b2'],
      invert: true,
      definition: 0.5,
      influence: 1,
    },
    themeColor: '#ff08b2',
    rulesets: [],
    published: true,
  },
];

const PROFILES: readonly { slug: string; username: string; avatarUrl: string }[] = [
  {
    slug: 'thialfi',
    username: 'Thialfi',
    avatarUrl: '/play-fixtures/product/cbe65f163cb7aaa61c9f6c8156b682f7ad59b4c1fce5f5bae58f7d0b2dcbd0d9.jpg',
  },
  {
    slug: 'twaffle',
    username: 'Twaffle',
    avatarUrl: '/play-fixtures/product/75fe991834aad9ba01921a1519bb8f8333255256fbadc75801e0dacd0e2b8c9b.jpg',
  },
  {
    slug: 'fectumbra',
    username: 'fectumbra',
    avatarUrl: '/play-fixtures/product/494b2a2abc93f09f469c640e7d717e664e69f8104028492b20be44c780964471.jpg',
  },
  {
    slug: 'erickenneth',
    username: 'EricKenneth',
    avatarUrl: '/play-fixtures/product/6b35d91b40fbd9fd7de770d9ef9bdfe6a1e7682b09d03b25e3cad8b14959bb72.jpg',
  },
  {
    slug: 'ridwan',
    username: 'Ridwan',
    avatarUrl: '/play-fixtures/product/a3b41128abc9c359f8a7e82edcf3b18b4c371182b7ed02d1d4edab1f8f257211.jpg',
  },
  {
    slug: 'argelius',
    username: 'Argelius',
    avatarUrl: '/play-fixtures/product/a97a3b377cc73349521100a2c73b2907234a569f8b6317e209fbc87eba2eafb6.jpg',
  },
  {
    slug: 'klyzx',
    username: 'Klyzx',
    avatarUrl: '/play-fixtures/product/2323106e63d6787ccb2aff7ae938675f6005cb867e922cbb2b0f2628c79ccb72.jpg',
  },
  {
    slug: 'bigdave',
    username: 'BigDave',
    avatarUrl: '/play-fixtures/product/83308406d85921ae46daaa6ab5da2387b3e773b29251951012a20d64a917a5c0.jpg',
  },
];

/** The catalogue as the draft lists it for a game on the `dreamrules` ruleset. */
const DRAFT_FACTIONS: DraftFaction[] = [
  /*
   * The capture holds definitions only, so the six are staged as linked and published.
   * Production listed all six that way on 2026-09-12.
   */
  ...factions.map(({ slug, data }) => ({
    id: slug,
    slug,
    name: data.name,
    logo: data.logo,
    background: data.background,
    color: data.themeColor,
    linked: true,
    published: true,
  })),
  ...OTHER_FACTIONS.map((entry) => ({
    id: entry.slug,
    slug: entry.slug,
    name: entry.name,
    logo: entry.logo,
    background: entry.background,
    color: entry.themeColor,
    linked: entry.rulesets.includes('dreamrules'),
    published: entry.published,
  })),
];

export type StoryPlayer = PublicControls['players'][number];

/** A real profile at a seat. */
export function storyPlayer(seat: string, slug: string): StoryPlayer {
  const profile = PROFILES.find((candidate) => candidate.slug === slug);
  if (!profile) {
    throw new Error(`Unknown profile ${slug}`);
  }
  return { seat, name: profile.username, avatar: profile.avatarUrl };
}

/** A drafting real game with the given players seated, at the given table size, with the draft as given. */
export function draftingSnapshot(
  players: StoryPlayer[],
  seatCount: TableSeatCount,
  draft: Partial<Pick<DraftState, 'picks' | 'bans' | 'ready' | 'failure'>> = {},
  seatRequests: NonNullable<GameSnapshot['controls']>['seatRequests'] = []
): GameSnapshot {
  return {
    ...emptySnapshot(),
    roster: {
      seatCount,
      seats: players.map((player, position) => ({ id: player.seat, position, faction: null })),
    },
    controls: {
      ...emptyPublicControls(),
      seats: players.map((player) => player.seat),
      players,
      seatRequests,
    },
    draft: {
      minimum: seatCount,
      factions: DRAFT_FACTIONS,
      catalogueAt: 1,
      picks: draft.picks ?? {},
      bans: draft.bans ?? {},
      ready: draft.ready ?? [],
      failure: draft.failure ?? null,
    },
  };
}
