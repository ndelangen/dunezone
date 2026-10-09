import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { playCreateGameRequestSchema } from '../src/shared/play/admission';
import { playCreateGameOutcomeSchema } from '../src/shared/play/seatLimit';
import { internalMutation } from './functions';
import { isIsolatedLoopbackBackend } from './lib/isolatedBackend';
import { createAuthorizedGame } from './playGames';

function requireLoopback() {
  if (!isIsolatedLoopbackBackend()) {
    throw new Error('The suffix proof requires an isolated loopback backend');
  }
}

/** Independently entered suffixes occupy a dense range while their parent's cursor remains behind. */
export const seedDense = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    requireLoopback();
    await ctx.db.insert('play_game_slug_reservations', { slug: 'caladan-dense-picnic' });
    for (let suffix = 64; suffix >= 1; suffix -= 1) {
      await ctx.db.insert('play_game_slug_reservations', { slug: `caladan-dense-picnic-${suffix.toString(36)}` });
    }
    await ctx.db.insert('play_game_slug_cursors', { base: 'caladan-dense-picnic', next_suffix: 1 });
    return null;
  },
});

/** A pre-existing cursor exercises a rejected counter word in the creation transaction. */
export const seedPolicy = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    requireLoopback();
    await ctx.db.insert('play_game_slug_cursors', { base: 'policy-dinner', next_suffix: Number.parseInt('bad', 36) });
    return null;
  },
});

/** Fixed server policies exercise named and generated creation without exposing a policy to public callers. */
export const createWithPolicy = internalMutation({
  args: {
    ...zodToConvex(playCreateGameRequestSchema).fields,
    policy: v.union(v.literal('word'), v.literal('window'), v.literal('generated'), v.literal('reject')),
  },
  returns: zodToConvex(playCreateGameOutcomeSchema),
  handler: async (ctx, args) => {
    requireLoopback();
    switch (args.policy) {
      case 'word':
        return await createAuthorizedGame(
          ctx,
          args,
          'Policy dinner',
          (slug) => slug !== 'policy-dinner' && !slug.endsWith('-bad')
        );
      case 'window':
        return await createAuthorizedGame(ctx, args, 'Policy window', (slug) =>
          /^policy-window-[a-z0-9]{13}$/.test(slug)
        );
      case 'generated':
        return await createAuthorizedGame(ctx, args, undefined, (slug) => /-[a-z0-9]{13}$/.test(slug));
      case 'reject':
        return await createAuthorizedGame(ctx, args, 'Policy rejected', () => false);
    }
  },
});
