import type { convexTest } from 'convex-test';
import type { z } from 'zod';

import type { NexusCardAsset } from '../src/shared/assets/schema';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import type { Id } from './_generated/dataModel';
import { syncFactionFamily } from './lib/factionFamilies';

/** A Nexus card linked to a Faction drawn as the card draws it, as the writer stores a link (#2921): the Faction's own id and address. */
export async function linkedNexusCard(
  t: ReturnType<typeof convexTest>,
  ownerId: Id<'users'>,
  card: z.infer<typeof NexusCardAsset>
) {
  const factionLink = await t.run(async (ctx) => {
    const id = await ctx.db.insert('factions', {
      owner_id: ownerId,
      data: {
        ...assetPublishingFaction,
        name: card.faction,
        emblem: card.factionSymbol.image,
        background: card.factionSymbol.background,
      },
      slug: card.faction.toLowerCase().replaceAll(' ', '-'),
      created_at: '2026-10-12T00:00:00Z',
      updated_at: '2026-10-12T00:00:00Z',
      is_deleted: false,
      group_id: null,
    });
    await syncFactionFamily(ctx, id, await ctx.db.get(id));
    const family = (await ctx.db.get((await ctx.db.get(id))!.family_id!))!;
    return { id: family._id, slug: family.slug };
  });
  return { ...card, factionLink };
}
