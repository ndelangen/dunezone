import { v } from 'convex/values';

import { internalMutation } from './functions';
import { isIsolatedLoopbackBackend } from './lib/isolatedBackend';
import { allocatePlayGameName } from './lib/playGameAddresses';

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

/** Exercise the actual Play adapter with a fixed server policy that rejects a counter word and a full counter window. */
export const policySelection = internalMutation({
  args: {},
  returns: v.object({ word: v.string(), window: v.string() }),
  handler: async (ctx) => {
    requireLoopback();
    await ctx.db.insert('play_game_slug_cursors', { base: 'policy-dinner', next_suffix: Number.parseInt('bad', 36) });
    const word = await allocatePlayGameName(
      ctx,
      'Policy dinner',
      (slug) => slug !== 'policy-dinner' && !slug.endsWith('-bad')
    );
    const window = await allocatePlayGameName(ctx, 'Policy window', (slug) =>
      /^policy-window-[a-z0-9]{13}$/.test(slug)
    );
    return { word: word.slug, window: window.slug };
  },
});
