import type { CardbackPresetKey } from '../../src/shared/assets/cardbackPresetKeys';
import { INITIAL_CARDBACK_PRESETS } from '../../src/shared/assets/cardbackPresets';
import { CardBack } from '../../src/shared/assets/schema';
import type { QueryCtx } from '../types';

/** The existing standard deck remains the source until its family has an explicit shared back. */
export async function rawCardbackPreset(ctx: Pick<QueryCtx, 'db'>, key: CardbackPresetKey) {
  const row = await ctx.db
    .query('cardback_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (row) {
    return { cardback: row.cardback, revision: row.revision };
  }
  const initial = INITIAL_CARDBACK_PRESETS.find((entry) => entry.key === key)!;
  if (['stronghold', 'homeworld', 'nexus', 'leader-skill'].includes(key)) {
    const deck = await ctx.db
      .query('assets')
      .withIndex('by_type_and_slug', (q) => q.eq('type', 'deck').eq('slug', `${key}-deck`))
      .unique();
    const back = deck && !deck.is_deleted ? (deck.data as { cardback?: Record<string, unknown> }).cardback : null;
    if (back) {
      const parsed = CardBack.safeParse(Object.fromEntries(Object.entries(back).filter(([field]) => field !== 'mode')));
      if (parsed.success) {
        return { cardback: parsed.data, revision: 0 };
      }
    }
  }
  return { cardback: initial.cardback, revision: 0 };
}
