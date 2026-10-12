import { zodToConvex } from 'convex-helpers/server/zod4';
import { ConvexError, v } from 'convex/values';

import { cardbackPresetSchema } from '../src/shared/assets/cardbackPresets';
import {
  CARD_FRONT_PUBLICATION_REVISIONS,
  cardFrontPresetKeySchema,
  cardFrontPresetSchema,
  cardFrontPresetType,
  cardFrontStyleSchema,
} from '../src/shared/assets/cardFrontPresets';
import { CustomCardTokens } from '../src/shared/assets/schema';
import { mutation, publicQuery } from './functions';
import { listCardbackPresets } from './lib/cardbackPresets';
import { cardFrontPresetFor, listCardFrontPresets, storeCardFrontPreset } from './lib/cardFrontPresets';
import { resolveCustomCardTokens } from './lib/customCardTokens';
import { requireAdminUserId } from './lib/policy';
import { publicationSettings } from './lib/publication';

/* The preset page holds one subscription for both faces. The older back-only query stays for deployed clients. */
export const page = publicQuery({
  args: {},
  returns: v.object({
    fronts: v.array(zodToConvex(cardFrontPresetSchema)),
    backs: v.array(zodToConvex(cardbackPresetSchema)),
  }),
  handler: async (ctx) => ({ fronts: await listCardFrontPresets(ctx), backs: await listCardbackPresets(ctx) }),
});
export const list = publicQuery({
  args: {},
  returns: v.array(zodToConvex(cardFrontPresetSchema)),
  handler: async (ctx) => await listCardFrontPresets(ctx),
});
export const save = mutation({
  args: { key: zodToConvex(cardFrontPresetKeySchema), style: zodToConvex(cardFrontStyleSchema), revision: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const type = cardFrontPresetType(args.key);
    if (((await publicationSettings(ctx))?.renderer_revisions[type] ?? 0) < CARD_FRONT_PUBLICATION_REVISIONS[type]) {
      throw new ConvexError('Front publication is not ready yet. Try again after the release finishes.');
    }
    const parsed = cardFrontStyleSchema.safeParse(args.style);
    if (!parsed.success || !Number.isInteger(args.revision) || args.revision < 0) {
      throw new ConvexError('Check the front preset fields before saving.');
    }
    return await storeCardFrontPreset(ctx, args.key, parsed.data, args.revision);
  },
});

/* Storm create pages resolve their shared front and embedded tokens in one subscription. */
export const stormAuthoring = publicQuery({
  args: { ids: v.array(v.id('assets')) },
  returns: v.object({
    style: zodToConvex(cardFrontStyleSchema),
    tokens: zodToConvex(CustomCardTokens),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => ({
    style: (await cardFrontPresetFor(ctx, 'storm')).style,
    ...(await resolveCustomCardTokens(ctx, args.ids)),
  }),
});
