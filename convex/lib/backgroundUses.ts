import type { Triggers } from 'convex-helpers/server/triggers';

import { cardFrontPresetKey } from '../../src/shared/assets/cardFrontPresets';
import { backgroundPresetKeys } from '../../src/shared/backgrounds/schema';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { validateBackgroundLinks } from './backgroundPresets';

function allowsFamily(row: Doc<'assets'> | Doc<'factions'> | null) {
  if (!row || !('type' in row)) {
    return false;
  }
  return cardFrontPresetKey(row.type, row.data) !== null;
}
function obsoleteUses(rows: Doc<'background_uses'>[], wanted: Set<string>) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!wanted.has(row.key) || seen.has(row.key)) {
      return true;
    }
    seen.add(row.key);
    return false;
  });
}
async function syncUses(
  ctx: MutationCtx,
  subject: Id<'assets'> | Id<'factions'>,
  kind: 'asset' | 'faction',
  data: unknown
) {
  const wanted = new Set(backgroundPresetKeys(data));
  const current = await ctx.db
    .query('background_uses')
    .withIndex('by_subject', (q) => q.eq('subject', subject))
    .take(512);
  const existing = new Set(current.map((row) => row.key));
  const missing = [...wanted].filter((key) => !existing.has(key));
  await Promise.all([
    ...obsoleteUses(current, wanted).map((row) => ctx.db.delete(row._id)),
    ...missing.map((key) => ctx.db.insert('background_uses', { key, subject, kind })),
  ]);
}

/** Every application write maintains the reverse index in the same transaction as its authored data. */
export function registerBackgroundUseTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  for (const table of ['assets', 'factions'] as const) {
    triggers.register(table, async (ctx, change) => {
      const data = change.newDoc?.is_deleted === false ? change.newDoc.data : undefined;
      await validateBackgroundLinks(ctx, data, allowsFamily(change.newDoc));
      await syncUses(ctx, change.id, table === 'assets' ? 'asset' : 'faction', data);
    });
  }
}
