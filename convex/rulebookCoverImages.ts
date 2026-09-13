import { zodToConvex } from 'convex-helpers/server/zod4';
import { ConvexError, v } from 'convex/values';

import { rulebookCoverImageSchema } from '../src/shared/rulebooks/coverImage';
import type { RulebookCoverImage } from '../src/shared/rulebooks/coverImage';
import { userImageSourceUrlSchema } from '../src/shared/user-images/contract';
import { internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';
import { requireRulesetUpdate } from './lib/collaborativeAccess';
import { ingestBaseUrl, ingestWithToken } from './lib/userImageIngest';

export const assertEditable = internalQuery({
  args: { rulebookId: v.id('rulebooks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rulebook = await ctx.db.get(args.rulebookId);
    if (!rulebook || rulebook.is_deleted) {
      throw new ConvexError('Rulebook not found');
    }
    await requireRulesetUpdate(ctx, rulebook.ruleset_id);
    return null;
  },
});

export const stagedImage = internalQuery({
  args: { token: v.string() },
  returns: v.union(zodToConvex(rulebookCoverImageSchema), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('user_image_ingest_tokens')
      .withIndex('by_token_id', (q) => q.eq('token_id', args.token))
      .unique();
    return row?.consumed ? (row.rulebook_cover_image ?? null) : null;
  },
});

/** Rehosting stages an image; the ordinary revision-checked Save owns the draft write. */
export const rehost = action({
  args: { rulebookId: v.id('rulebooks'), sourceUrl: v.string() },
  returns: zodToConvex(rulebookCoverImageSchema),
  handler: async (ctx, args): Promise<RulebookCoverImage> => {
    const source = userImageSourceUrlSchema.safeParse(args.sourceUrl);
    if (!source.success) {
      throw new ConvexError(source.error.issues[0]?.message ?? 'Invalid cover image URL');
    }
    await ctx.runQuery(internal.rulebookCoverImages.assertEditable, { rulebookId: args.rulebookId });
    const baseUrl = ingestBaseUrl();
    const { token } = await ctx.runMutation(internal.ingestTokens.mint, {
      capability: { kind: 'rulebook_cover', rulebook_id: args.rulebookId },
      source_url: source.data,
    });
    await ingestWithToken(baseUrl, source.data, token);
    const image: RulebookCoverImage | null = await ctx.runQuery(internal.rulebookCoverImages.stagedImage, { token });
    if (!image) {
      throw new ConvexError('The cover image could not be stored');
    }
    return image;
  },
});
