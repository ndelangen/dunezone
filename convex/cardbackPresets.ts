import { zodToConvex } from 'convex-helpers/server/zod4';
import { ConvexError, v } from 'convex/values';

import { cardbackPresetKeySchema } from '../src/shared/assets/cardbackPresetKeys';
import { cardbackPresetSchema } from '../src/shared/assets/cardbackPresets';
import { CardBack } from '../src/shared/assets/schema';
import { query } from './_generated/server';
import { mutation } from './functions';
import { optionalActiveUserId } from './lib/accountLifecycle';
import { listCardbackPresets, storeCardbackPreset } from './lib/cardbackPresets';
import { requireAdminUserId } from './lib/policy';
import { publicationSettings } from './lib/publication';

export const list = query({
  args: {},
  returns: v.array(zodToConvex(cardbackPresetSchema)),
  handler: async (ctx) => await listCardbackPresets(ctx),
});

export const editor = query({
  args: {},
  returns: v.object({
    access: v.union(v.literal('anonymous'), v.literal('denied'), v.literal('admin')),
    presets: v.array(zodToConvex(cardbackPresetSchema)),
  }),
  handler: async (ctx) => {
    const userId = await optionalActiveUserId(ctx);
    if (!userId) {
      return { access: 'anonymous' as const, presets: [] };
    }
    if (!(await ctx.db.get('users', userId))?.isAdmin) {
      return { access: 'denied' as const, presets: [] };
    }
    return { access: 'admin' as const, presets: await listCardbackPresets(ctx) };
  },
});

export const save = mutation({
  args: { key: zodToConvex(cardbackPresetKeySchema), cardback: zodToConvex(CardBack), revision: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    if (!(await publicationSettings(ctx))?.renderer_revisions['cardback-preset']) {
      throw new ConvexError('Card-back publication is not ready yet. Try again after the release finishes.');
    }
    const parsed = CardBack.safeParse(args.cardback);
    if (!parsed.success) {
      throw new ConvexError('Check the card-back fields before saving.');
    }
    return storeCardbackPreset(ctx, args.key, parsed.data, args.revision);
  },
});
