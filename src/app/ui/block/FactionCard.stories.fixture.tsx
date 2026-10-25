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
