import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { CanonicalFactionStoredSchema } from '../src/shared/factions/schema';
import { rulebookResolvedSourceSchema } from '../src/shared/rulebooks/sources';
import { query } from './_generated/server';
import { resolveRulebookTroopSource } from './lib/rulebookTroopSources';

/** The Leader picker subscribes only after a faction has been chosen. */
export const factionMembers = query({
  args: { faction_id: v.id('factions') },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      members: v.array(
        v.object({ memberId: v.string(), name: v.string(), role: v.string(), imageUrl: v.union(v.string(), v.null()) })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const faction = await ctx.db.get('factions', args.faction_id);
    if (!faction || faction.is_deleted) {
      return null;
    }
    const parsed = CanonicalFactionStoredSchema.safeParse(faction.data);
    if (!parsed.success) {
      return null;
    }
    const members = await Promise.all(
      [parsed.data.factionLeader, ...parsed.data.leaders].flatMap((member, index) => {
        if (!member.memberId) {
          return [];
        }
        const memberId = member.memberId;
        return [
          (async () => {
            const publicationId = factionMemberPublicationId(args.faction_id, memberId);
            const publication = await ctx.db
              .query('publication_assets')
              .withIndex('by_asset_type_and_asset_id', (q) =>
                q.eq('asset_type', 'faction-leader').eq('asset_id', publicationId)
              )
              .unique();
            return {
              memberId,
              name: member.name,
              role: index === 0 ? 'Ruler' : 'Leader',
              imageUrl: publication ? publishedHref('faction-leader', publicationId, publication.cache_token) : null,
            };
          })(),
        ];
      })
    );
    return { name: parsed.data.name, members };
  },
});

/* The troop picker reads only the selected faction, including each authored back face. */
export const factionTroops = query({
  args: { faction_id: v.id('factions') },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      troops: v.array(v.object({ name: v.string(), source: zodToConvex(rulebookResolvedSourceSchema) })),
    })
  ),
  handler: async (ctx, { faction_id }) => {
    const faction = await ctx.db.get('factions', faction_id);
    if (!faction || faction.is_deleted) {
      return null;
    }
    const parsed = CanonicalFactionStoredSchema.safeParse(faction.data);
    if (!parsed.success) {
      return null;
    }
    const references = parsed.data.troops.flatMap((troop) =>
      troop.troopId
        ? (troop.back ? (['front', 'back'] as const) : (['front'] as const)).map((face) => ({
            kind: 'faction-troop' as const,
            factionId: faction_id,
            troopId: troop.troopId!,
            face,
          }))
        : []
    );
    const troops = await Promise.all(
      references.map(async (reference) => {
        const troop = parsed.data.troops.find((troop) => troop.troopId === reference.troopId)!;
        return {
          name: reference.face === 'back' ? troop.back!.name : troop.name,
          source: await resolveRulebookTroopSource(ctx, parsed.data.troops, reference),
        };
      })
    );
    return { name: parsed.data.name, troops };
  },
});
