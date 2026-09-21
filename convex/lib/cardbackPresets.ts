import type { CardbackPresetKey } from '../../src/shared/assets/cardbackPresetKeys';
import type { CardbackPreset } from '../../src/shared/assets/cardbackPresets';
import { INITIAL_CARDBACK_PRESETS } from '../../src/shared/assets/cardbackPresets';
import { publicationStatusFor } from '../assetPublishingStatus';
import type { MutationCtx, QueryCtx } from '../types';
import { enqueuePublicationJob, publicationJobsForAsset } from './publication';

export async function presetFor(ctx: Pick<QueryCtx, 'db'>, key: CardbackPresetKey): Promise<CardbackPreset> {
  const initial = INITIAL_CARDBACK_PRESETS.find((preset) => preset.key === key)!;
  const row = await ctx.db
    .query('cardback_presets')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  const status = await publicationStatusFor(ctx, 'cardback-preset', key);
  const jobs = await publicationJobsForAsset(ctx, 'cardback-preset', key);
  return {
    key,
    label: initial.label,
    cardback: row?.cardback ?? initial.cardback,
    revision: row?.revision ?? 0,
    href: status.publicationHref,
    captureStatus: status.captureStatus ?? (jobs.some((job) => job.status === 'error') ? 'error' : null),
  };
}

export async function listCardbackPresets(ctx: Pick<QueryCtx, 'db'>) {
  return Promise.all(INITIAL_CARDBACK_PRESETS.map(({ key }) => presetFor(ctx, key)));
}

/** Activation creates missing definitions and republishes saved designs without overwriting an Administrator's edits. */
export async function publishCardbackPresets(ctx: MutationCtx) {
  for (const initial of INITIAL_CARDBACK_PRESETS) {
    const row = await ctx.db
      .query('cardback_presets')
      .withIndex('by_key', (q) => q.eq('key', initial.key))
      .unique();
    if (!row) {
      await ctx.db.insert('cardback_presets', {
        key: initial.key,
        cardback: initial.cardback,
        revision: 1,
        updated_at: Date.now(),
      });
    }
    await enqueuePublicationJob(ctx, {
      assetType: 'cardback-preset',
      assetId: initial.key,
      assetData: { assetId: initial.key, slug: initial.key, cardback: row?.cardback ?? initial.cardback },
    });
  }
}
