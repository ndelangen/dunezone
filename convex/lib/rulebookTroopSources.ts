import type { z } from 'zod';

import { componentGeometrySchema } from '../../src/shared/asset-publishing/componentGeometry';
import { factionTroopPublicationId } from '../../src/shared/asset-publishing/factionTroopPublication';
import { publishedHref } from '../../src/shared/asset-publishing/publicationTargets';
import type { CanonicalFactionStoredSchema } from '../../src/shared/factions/schema';
import type { RulebookResolvedSource, RulebookSourceReference } from '../../src/shared/rulebooks/sources';
import type { QueryCtx } from '../types';

type TroopReference = Extract<RulebookSourceReference, { kind: 'faction-troop' }>;
type Troop = z.infer<typeof CanonicalFactionStoredSchema>['troops'][number];

/** Lists the stable references available from a faction's current troop faces. */
export function rulebookTroopReferences(
  factionId: TroopReference['factionId'],
  troops: readonly Troop[]
): TroopReference[] {
  return troops.flatMap(({ troopId, back }) => {
    if (!troopId) {
      return [];
    }
    const faces = back ? (['front', 'back'] as const) : (['front'] as const);
    return faces.map((face) => ({ kind: 'faction-troop', factionId, troopId, face }));
  });
}

/* Both the picker and the reader resolve the selected face against the current troop roster. */
export async function resolveRulebookTroopSource(
  ctx: Pick<QueryCtx, 'db'>,
  troops: readonly Troop[],
  reference: TroopReference
): Promise<RulebookResolvedSource> {
  const troop = troops.find(({ troopId }) => troopId === reference.troopId);
  const face = reference.face === 'back' ? troop?.back : troop;
  if (!face) {
    return { status: 'unavailable', reference };
  }
  const publicationId =
    factionTroopPublicationId(reference.factionId, reference.troopId) + (reference.face === 'back' ? '.back' : '');
  const publication = await ctx.db
    .query('publication_assets')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'faction-troop').eq('asset_id', publicationId))
    .unique();
  if (!publication) {
    return { status: 'unavailable', reference };
  }
  const geometry = componentGeometrySchema.safeParse(publication.component_geometry);
  return {
    status: 'ready',
    reference,
    name: face.name,
    imageUrl: publishedHref('faction-troop', publicationId, publication.cache_token),
    publicationRevision: publication.cache_token,
    ...(geometry.success ? { geometry: geometry.data } : {}),
    width: 600,
    height: 600,
  };
}
