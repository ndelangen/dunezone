import { zodToConvex } from 'convex-helpers/server/zod4';
import { ConvexError, v } from 'convex/values';

import {
  cardFrontPresetKey,
  inheritsCardFrontRegion,
  cardFrontPresetType,
  INITIAL_CARD_FRONT_PRESETS,
} from '../src/shared/assets/cardFrontPresets';
import type { SharedBackgroundPreset } from '../src/shared/backgrounds/schema';
import { backgroundPresetSchema } from '../src/shared/backgrounds/schema';
import { Background } from '../src/shared/factions/schema';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, mutation, publicQuery } from './functions';
import { listBackgroundPresets, listSavedBackgroundPresets, assertBackgroundCapacity } from './lib/backgroundPresets';
import { queueBackgroundRecaptures } from './lib/backgroundRegeneration';
import { canonicalJson } from './lib/canonicalJson';
import { presetFromKey } from './lib/cardbackPresets';
import { requireAdminUserId } from './lib/policy';
import {
  enqueueAssetPublication,
  enqueueFactionTokenPublication,
  enqueueFactionSheetPublication,
  enqueueFactionLeaderPublications,
  enqueueFactionFaces,
  enqueueFactionFacePublications,
  enqueuePublicationJob,
} from './lib/publication';
import type { MutationCtx } from './types';

export const list = publicQuery({
  args: {},
  returns: v.array(zodToConvex(backgroundPresetSchema)),
  handler: listSavedBackgroundPresets,
});

export const save = mutation({
  args: zodToConvex(backgroundPresetSchema).fields,
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    return await storeBackgroundPreset(ctx, args);
  },
});

export async function storeBackgroundPreset(ctx: MutationCtx, args: SharedBackgroundPreset) {
  const parsed = backgroundPresetSchema.parse(args);
  const current = (await listBackgroundPresets(ctx)).find((preset) => preset.key === args.key);
  if ((current?.revision ?? 0) !== args.revision) {
    throw new ConvexError('This background changed elsewhere. Reset to load the saved version.');
  }
  const row = await ctx.db
    .query('background_presets')
    .withIndex('by_key', (q) => q.eq('key', args.key))
    .unique();
  if (!row) {
    await assertBackgroundCapacity(ctx, 1);
  }
  const revision = parsed.revision + 1;
  const saved = { ...parsed, revision, updated_at: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, saved);
  } else {
    await ctx.db.insert('background_presets', saved);
  }
  if (!current || canonicalJson(current.value) !== canonicalJson(Background.parse(args.value))) {
    await queueBackgroundRecaptures(ctx, [args.key]);
  }
  return revision;
}

async function recaptureAsset(ctx: MutationCtx, asset: Doc<'assets'>) {
  await enqueueAssetPublication(ctx, asset);
  if (asset.type.startsWith('token-')) {
    await ctx.scheduler.runAfter(0, internal.assets.refreshEmbeddedCards, { tokenId: asset._id, cursor: null });
    await ctx.scheduler.runAfter(0, internal.assets.refreshSpiceCards, {
      dependencyId: asset._id,
      kind: 'spice-card-token',
      cursor: null,
    });
  }
}
async function recaptureFaction(ctx: MutationCtx, faction: Doc<'factions'>) {
  await enqueueFactionTokenPublication(ctx, faction);
  await enqueueFactionSheetPublication(ctx, faction);
  await enqueueFactionLeaderPublications(ctx, faction);
  await enqueueFactionFaces(ctx, faction);
}
async function recaptureUse(ctx: MutationCtx, use: Doc<'background_uses'>) {
  const id = ctx.db.normalizeId(use.kind === 'asset' ? 'assets' : 'factions', use.subject);
  if (!id) {
    return;
  }
  if (use.kind === 'asset') {
    const asset = await ctx.db.get('assets', id as Doc<'assets'>['_id']);
    if (asset && !asset.is_deleted) {
      await recaptureAsset(ctx, asset);
    }
    return;
  }
  const faction = await ctx.db.get('factions', id as Doc<'factions'>['_id']);
  if (faction && !faction.is_deleted) {
    await recaptureFaction(ctx, faction);
  }
}
export const recapture = internalMutation({
  args: { key: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('background_uses')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .paginate({ cursor: args.cursor, numItems: 1 });
    await Promise.all(page.page.map((use) => recaptureUse(ctx, use)));
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.backgroundPresets.recapture, { ...args, cursor: page.continueCursor });
    }
    return null;
  },
});

type FamilyScan = { key: string; regions?: ('header' | 'icon')[]; cursor: string | null };
async function recaptureFactionFamily(
  ctx: MutationCtx,
  type: 'faction-traitor' | 'faction-alliance',
  args: FamilyScan
) {
  const page = await ctx.db
    .query('factions')
    .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
    .paginate({ cursor: args.cursor, numItems: 2 });
  await Promise.all(page.page.map((faction) => enqueueFactionFacePublications(ctx, type, faction)));
  return page;
}
function followsFamily(asset: Doc<'assets'>, type: string, args: FamilyScan) {
  return (
    cardFrontPresetKey(type, asset.data) === args.key &&
    (args.regions ?? (['header', 'icon'] as const)).some((region) => inheritsCardFrontRegion(type, asset.data, region))
  );
}
async function recaptureAssetFamily(ctx: MutationCtx, type: string, args: FamilyScan) {
  const page = await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
    .paginate({ cursor: args.cursor, numItems: 20 });
  await Promise.all(
    page.page.filter((asset) => followsFamily(asset, type, args)).map((asset) => recaptureAsset(ctx, asset))
  );
  return page;
}
async function recaptureFamilyPage(ctx: MutationCtx, args: FamilyScan) {
  const preset = INITIAL_CARD_FRONT_PRESETS.find((entry) => entry.key === args.key);
  if (!preset) {
    return;
  }
  const type = cardFrontPresetType(preset.key);
  const page =
    type === 'faction-traitor' || type === 'faction-alliance'
      ? await recaptureFactionFamily(ctx, type, args)
      : await recaptureAssetFamily(ctx, type, args);
  if (!page.isDone) {
    await ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureFamily, {
      ...args,
      cursor: page.continueCursor,
    });
  }
}
export const recaptureFamily = internalMutation({
  args: {
    key: v.string(),
    regions: v.optional(v.array(v.union(v.literal('header'), v.literal('icon')))),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recaptureFamilyPage(ctx, args);
    return null;
  },
});
export const recaptureBack = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const preset = await presetFromKey(ctx, args.key, new Map());
    if (preset) {
      await enqueuePublicationJob(ctx, {
        assetType: 'cardback-preset',
        assetId: args.key,
        assetData: { assetId: args.key, slug: args.key, cardback: preset.cardback },
      });
    }
    return null;
  },
});
