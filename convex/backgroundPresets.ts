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
import { listBackgroundPresets, MAX_BACKGROUND_PRESETS } from './lib/backgroundPresets';
import { queueBackgroundRecaptures } from './lib/backgroundRegeneration';
import { canonicalJson } from './lib/canonicalJson';
import { requireAdminUserId } from './lib/policy';
import {
  enqueueAssetPublication,
  enqueueFactionTokenPublication,
  enqueueFactionSheetPublication,
  enqueueFactionLeaderPublications,
  enqueueFactionFaces,
  enqueueFactionFacePublications,
} from './lib/publication';
import type { MutationCtx } from './types';

export const list = publicQuery({
  args: {},
  returns: v.array(zodToConvex(backgroundPresetSchema)),
  handler: listBackgroundPresets,
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
  if (
    !row &&
    (await ctx.db.query('background_presets').take(MAX_BACKGROUND_PRESETS)).length >= MAX_BACKGROUND_PRESETS
  ) {
    throw new ConvexError('The background library is full. Edit an existing preset.');
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
export const recapture = internalMutation({
  args: { key: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('background_uses')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .paginate({ cursor: args.cursor, numItems: 1 });
    for (const use of page.page) {
      if (use.kind === 'asset') {
        const id = ctx.db.normalizeId('assets', use.subject);
        const row = id ? await ctx.db.get('assets', id) : null;
        if (row && !row.is_deleted) {
          await recaptureAsset(ctx, row);
        }
      } else {
        const id = ctx.db.normalizeId('factions', use.subject);
        const row = id ? await ctx.db.get('factions', id) : null;
        if (row && !row.is_deleted) {
          await recaptureFaction(ctx, row);
        }
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.backgroundPresets.recapture, { ...args, cursor: page.continueCursor });
    }
    return null;
  },
});
export const recaptureFamily = internalMutation({
  args: {
    key: v.string(),
    regions: v.optional(v.array(v.union(v.literal('header'), v.literal('icon')))),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const preset = INITIAL_CARD_FRONT_PRESETS.find((entry) => entry.key === args.key);
    if (!preset) {
      return null;
    }
    const type = cardFrontPresetType(preset.key);
    if (type.startsWith('faction-')) {
      const page = await ctx.db
        .query('factions')
        .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
        .paginate({ cursor: args.cursor, numItems: 2 });
      for (const faction of page.page) {
        if (type === 'faction-traitor' || type === 'faction-alliance') {
          await enqueueFactionFacePublications(ctx, type, faction);
        }
      }
      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureFamily, {
          ...args,
          cursor: page.continueCursor,
        });
      }
    } else {
      const page = await ctx.db
        .query('assets')
        .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
        .paginate({ cursor: args.cursor, numItems: 20 });
      for (const asset of page.page) {
        if (
          cardFrontPresetKey(type, asset.data) === preset.key &&
          (args.regions ?? (['header', 'icon'] as const)).some((region) =>
            inheritsCardFrontRegion(type, asset.data, region)
          )
        ) {
          await recaptureAsset(ctx, asset);
        }
      }
      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureFamily, {
          ...args,
          cursor: page.continueCursor,
        });
      }
    }
    return null;
  },
});
export const recaptureBack = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { presetFromKey } = await import('./lib/cardbackPresets');
    const { enqueuePublicationJob } = await import('./lib/publication');
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
