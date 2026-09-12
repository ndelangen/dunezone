/*
 * PROTOTYPE (#1145): real faction catalogue data, read once from production through the public query API (factions:cataloguePage and factions:getBySlug) on 2026-09-12.
 * Display only, never merged; a snapshot the catalogue may have moved past. Test rows, jokes and duplicates are left out.
 */
import type { Token } from '@game/assets/faction/token/Token';
import type { Background } from '@shared/factions/schema';
import type { ComponentProps } from 'react';
import type { z } from 'zod';

export type CatalogueFactionFixture = {
  slug: string;
  name: string;
  logo: ComponentProps<typeof Token>['logo'];
  background: z.infer<typeof Background>;
  /* Ruleset slugs the faction is linked to; `dreamrules` is the demo game's ruleset. */
  rulesets: string[];
  /* Whether its generated assets are published (assetPublishing.status is current). */
  published: boolean;
};

export const CATALOGUE_FACTIONS: readonly CatalogueFactionFixture[] = [
  {
    slug: 'house-atreides',
    name: 'House Atreides',
    logo: '/vector/logo/atreides.svg',
    background: { image: '/image/texture/082.jpg', colors: ['#393d05', '#5c5d10'], invert: true, definition: 0.5, influence: 1 },
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'house-harkonnen',
    name: 'House Harkonnen',
    logo: '/vector/logo/harkonnen.svg',
    background: { image: '/image/texture/026.jpg', colors: ['#0a080b', '#363636'], invert: false, definition: 0.1, influence: 1 },
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'emperor',
    name: 'Emperor',
    logo: '/vector/logo/emperor.svg',
    background: { image: '/image/texture/055.jpg', colors: ['#8C0402', '#db1918'], invert: false, definition: 0.31, influence: 1 },
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'spacing-guild',
    name: 'Spacing Guild',
    logo: '/vector/logo/guild.svg',
    background: { image: '/image/texture/006.jpg', colors: ['#bd3108', '#e05719'], invert: false, definition: 0.2, influence: 1 },
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'fremen',
    name: 'Fremen',
    logo: '/vector/logo/fremen.svg',
    background: { image: '/image/texture/019.jpg', colors: ['#fcb843', '#d2781d'], invert: false, definition: 0.3, influence: 0.634 },
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'bene-gesserit',
    name: 'Bene Gesserit',
    logo: '/vector/logo/bene-gesserit.svg',
    background: { image: '/image/texture/019.jpg', colors: ['#132b74', '#34478b'], invert: false, definition: 0.09, influence: 0.8878 },
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'ixians',
    name: 'Ixians',
    logo: '/vector/logo/ixian.svg',
    background: { image: '/image/texture/022.jpg', colors: ['#b29b54', '#d1be82'], invert: true, definition: 0.25, influence: 0.9008 },
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'bene-tleilax',
    name: 'Bene Tleilax',
    logo: '/vector/logo/bene-tleilaxu.svg',
    background: { image: '/image/texture/073.jpg', colors: ['#3c0a78', '#741890'], invert: true, definition: 0.61, influence: 1 },
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'iduali',
    name: 'Iduali',
    logo: '/vector/logo/iduali.svg',
    background: { image: '/image/texture/082.jpg', colors: ['#663b01', '#3e2400'], invert: false, definition: 1, influence: 0.8704 },
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
    rulesets: ['dreamrules'],
    published: true,
  },
  {
    slug: 'richese',
    name: 'Richese',
    logo: '/vector/logo/richese.svg',
    background: { image: '/image/texture/021.jpg', colors: ['#e8e8e8', '#5e5e5e'], invert: true, definition: 0.5, influence: 1 },
    rulesets: [],
    published: true,
  },
  {
    slug: 'ginaz',
    name: 'Ginaz',
    logo: '/vector/logo/ginaz.svg',
    background: { image: '/image/texture/022.jpg', colors: ['#009080', '#004D40'], invert: true, definition: 0, influence: 0.2518 },
    rulesets: [],
    published: true,
  },
  {
    slug: 'landsraad-council',
    name: 'Landsraad Council',
    logo: '/vector/generic/council.svg',
    background: { image: '/image/texture/001.jpg', colors: ['#444444', '#222222'], invert: true, definition: 0.5, influence: 1 },
    rulesets: [],
    published: true,
  },
  {
    slug: 'choam',
    name: 'CHOAM',
    logo: '/vector/generic/guildeyes.svg',
    background: { image: '/image/texture/021.jpg', colors: ['#5f0000', '#5f0000'], invert: true, definition: 0.5, influence: 1 },
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
    rulesets: [],
    published: true,
  },
  {
    slug: 'ordos',
    name: 'Ordos',
    logo: '/vector/generic/tech.svg',
    background: { image: '/image/texture/021.jpg', colors: ['#004020', '#222222'], invert: true, definition: 0.5, influence: 1 },
    rulesets: [],
    published: true,
  },
  {
    slug: 'thinking-machines',
    name: 'Thinking Machines',
    logo: '/vector/generic/detector.svg',
    background: { image: '/image/texture/021.jpg', colors: ['#808080', '#222222'], invert: true, definition: 0.5, influence: 1 },
    rulesets: [],
    published: true,
  },
  {
    slug: 'corrino',
    name: 'Corrino',
    logo: '/vector/generic/flauqre.svg',
    background: { image: '/image/texture/021.jpg', colors: ['#ff08b2', '#ff08b2'], invert: true, definition: 0.5, influence: 1 },
    rulesets: [],
    published: true,
  },
];
