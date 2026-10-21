import type { Triggers } from 'convex-helpers/server/triggers';

import { cardFrontPresetKey } from '../../src/shared/assets/cardFrontPresets';
import { backgroundPresetKeys } from '../../src/shared/backgrounds/schema';
import type { DataModel } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { validateBackgroundLinks } from './backgroundPresets';

/** Every application write maintains the reverse index in the same transaction as its authored data. */
export function registerBackgroundUseTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  for (const table of ['assets', 'factions'] as const) {
    triggers.register(table, async (ctx, change) => {
      const data = change.newDoc?.is_deleted === false ? change.newDoc.data : undefined;
      await validateBackgroundLinks(
        ctx,
        data,
        table === 'assets' &&
          change.newDoc !== null &&
          'type' in change.newDoc &&
          cardFrontPresetKey(change.newDoc.type, data) !== null
      );
      const wanted = new Set(backgroundPresetKeys(data));
      const current = await ctx.db
        .query('background_uses')
        .withIndex('by_subject', (q) => q.eq('subject', change.id))
        .take(512);
      for (const row of current) {
        if (!wanted.delete(row.key)) {
          await ctx.db.delete(row._id);
        }
      }
      for (const key of wanted) {
        await ctx.db.insert('background_uses', {
          key,
          subject: change.id,
          kind: table === 'assets' ? 'asset' : 'faction',
        });
      }
    });
  }
}
