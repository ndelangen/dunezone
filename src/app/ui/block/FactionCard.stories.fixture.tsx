import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';

import type { FactionCatalogueEntry } from '@db/factions';

export const baseFaction = {
  _id: 'faction-atreides',
  _creationTime: Date.parse('2026-07-20T10:00:00.000Z'),
  owner_id: 'owner-1',
  data: assetPublishingFaction,
  slug: 'atreides',
  group_id: null,
  created_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-20T10:00:00.000Z',
  is_deleted: false,
  rulesets: [{ id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune' }],
} as unknown as FactionCatalogueEntry;

/* A ruleset cover drawn in place, so it shows wherever the Storybook is hosted. */
export function drawnCover(sky: string, dune: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${sky}"/><circle cx="44" cy="20" r="9" fill="#f4e3b1"/><path d="M0 46 Q20 30 38 44 T64 40 V64 H0Z" fill="${dune}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* Eight rulesets as a card cites them: most with a cover, the third and the sixth without, as most rulesets start out. */
export const citedRulesets = [
  { id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune', coverThumbUrl: drawnCover('#27445c', '#c98a3c') },
  { id: 'ruleset-classic', slug: 'classic', name: 'Classic Dune', coverThumbUrl: drawnCover('#4a2d5e', '#d9a15a') },
  { id: 'ruleset-tournament', slug: 'tournament', name: 'Tournament Dune', coverThumbUrl: null },
  { id: 'ruleset-spring-cup', slug: 'spring-cup', name: 'Spring Cup', coverThumbUrl: drawnCover('#2f5a3f', '#e0c06a') },
  { id: 'ruleset-dreamrules', slug: 'dreamrules', name: 'Dreamrules', coverThumbUrl: drawnCover('#5c2a27', '#e2b36b') },
  { id: 'ruleset-sietch', slug: 'sietch-house-rules', name: 'Sietch house rules', coverThumbUrl: null },
  { id: 'ruleset-landsraad', slug: 'landsraad', name: 'Landsraad', coverThumbUrl: drawnCover('#1f4f55', '#d2a24c') },
  {
    id: 'ruleset-two-players',
    slug: 'two-players',
    name: 'Two players',
    coverThumbUrl: drawnCover('#3b3f6b', '#caa15c'),
  },
];

/** The base faction in the first `count` of the story rulesets. */
export function inRulesets(count: number): FactionCatalogueEntry {
  return {
    ...baseFaction,
    _id: `faction-atreides-${count}`,
    rulesets: citedRulesets.slice(0, count),
  } as unknown as FactionCatalogueEntry;
}

/* A self-contained image exercises publication delivery without a live publisher. */
export const publishedImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="300" fill="#4b4c0d"/><circle cx="300" cy="300" r="285" fill="none" stroke="#e3dbb3" stroke-width="8"/><text x="300" y="340" text-anchor="middle" font-family="serif" font-size="120" fill="#e3dbb3">AT</text></svg>')}`;
export const failedImage = 'data:image/png;base64,not-an-image';

export function withImages(image: string): FactionCatalogueEntry {
  return {
    ...baseFaction,
    tokenImages: {
      faction: image,
      members: Object.fromEntries(
        [baseFaction.data.factionLeader, ...baseFaction.data.leaders].map((member) => [member.memberId, image])
      ),
    },
  };
}

/* The tokens are decorative beside the link's own name, so their missing state sits under `aria-hidden`. */
export const missingToken = { name: 'Lady Jessica: preview unavailable', hidden: true };
