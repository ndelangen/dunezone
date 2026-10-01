import { catalogueEntries } from './mediaCatalogue';

const galleries = [
  {
    kind: 'leader',
    title: 'Leaders',
    samples: [
      '/image/leader/official/duncan.png',
      '/image/leader/official/otheym.png',
      '/image/leader/hivers/hiver-amber-pendant.png',
      '/image/leader/custom/evictus.png',
      '/image/leader/custom/kiln-synod/orri.png',
      '/image/leader/custom/brumal-court/vana.png',
    ],
  },
  {
    kind: 'decal',
    title: 'Decals',
    samples: [
      '/vector/decal/poison-blade.svg',
      '/vector/decal/atomics-multicolor.svg',
      '/vector/decal/ornithopters.svg',
      '/vector/decal/weather-control.svg',
      '/vector/decal/family-atomics-no-text.svg',
      '/vector/decal/prana-bundu.svg',
    ],
  },
  {
    kind: 'logo',
    title: 'Emblems',
    samples: ['/vector/logo/atreides.svg', '/vector/logo/ecaz.svg', '/vector/logo/ixian.svg'],
  },
  {
    kind: 'troop',
    title: 'Troops',
    samples: ['/vector/troop/acolyte.svg', '/vector/troop/bene-gesserit.svg', '/vector/troop/coat.svg'],
  },
  {
    kind: 'planet',
    title: 'Planets',
    samples: ['/image/planet/01.png', '/image/planet/04.png', '/image/planet/09.png'],
  },
  {
    kind: 'generic',
    title: 'Symbols',
    samples: ['/vector/generic/stormworld.svg', '/vector/generic/8point.svg', '/vector/generic/arrowbox.svg'],
  },
  {
    kind: 'icon',
    title: 'Game icons',
    samples: ['/vector/icon/alliance.svg', '/vector/icon/bidding_disc.svg', '/vector/icon/combat.svg'],
  },
  {
    kind: 'cover',
    title: 'Rulebook covers',
    samples: [
      '/image/rulebook-cover/ancient-bones.png',
      '/image/rulebook-cover/desert-lookout.png',
      '/image/rulebook-cover/stone-circle.png',
    ],
  },
] as const;

export const indexGalleries = galleries.map((gallery) => ({
  ...gallery,
  total: catalogueEntries.filter((entry) => entry.kind === gallery.kind).length,
  samples: gallery.samples.map((path) => catalogueEntries.find((entry) => entry.value === path)!),
}));
