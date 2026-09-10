import { v } from 'convex/values';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { CanonicalFactionStoredSchema } from '../src/shared/factions/schema';
import { query } from './_generated/server';

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
      [parsed.data.hero, ...parsed.data.leaders].flatMap((member, index) => {
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
