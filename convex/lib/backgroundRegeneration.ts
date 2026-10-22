import { internal } from '../_generated/api';
import type { MutationCtx } from '../types';
import { MAX_BACKGROUND_PRESETS } from './backgroundPresets';
import { backgroundSlots } from './backgroundPresetSlots';
import type { BackgroundSlot } from './backgroundPresetSlots';

type Region = 'header' | 'icon';
type Changes = { keys: Set<string>; families: Map<string, Set<Region>>; backs: Set<string> };

function sourceKey(slot: BackgroundSlot) {
  const source = slot.value.source;
  if (source?.kind === 'preset') {
    return source.key;
  }
  return source?.kind === 'custom' ? null : slot.key;
}
function slotsBySource(slots: BackgroundSlot[]) {
  const dependencies = new Map<string, BackgroundSlot[]>();
  slots.forEach((slot) => {
    const key = sourceKey(slot);
    if (key) {
      dependencies.set(key, [...(dependencies.get(key) ?? []), slot]);
    }
  });
  return dependencies;
}
function recordSlot(changes: Changes, slot: BackgroundSlot) {
  if (slot.family) {
    const regions = changes.families.get(slot.family) ?? new Set<Region>();
    regions.add(slot.key.endsWith('/header') ? 'header' : 'icon');
    changes.families.set(slot.family, regions);
  }
  if (slot.back) {
    changes.backs.add(slot.back);
  }
}
function expandChanges(slots: BackgroundSlot[], changed: readonly string[], shadowed: Set<string>): Changes {
  const changes: Changes = { keys: new Set(changed), families: new Map(), backs: new Set() };
  const pending = [...changes.keys];
  const dependencies = slotsBySource(slots);
  while (pending.length) {
    const key = pending.pop()!;
    (dependencies.get(key) ?? []).forEach((slot) => {
      recordSlot(changes, slot);
      if (!shadowed.has(slot.key) && !changes.keys.has(slot.key)) {
        changes.keys.add(slot.key);
        pending.push(slot.key);
      }
    });
  }
  return changes;
}

/** Follow standard slots as well as authored assets; a slot may itself use another named background. */
export async function queueBackgroundRecaptures(ctx: MutationCtx, changed: readonly string[]) {
  const [slots, saved] = await Promise.all([
    backgroundSlots(ctx),
    ctx.db.query('background_presets').take(MAX_BACKGROUND_PRESETS + 1),
  ]);
  const { keys, families, backs } = expandChanges(slots, changed, new Set(saved.map((row) => row.key)));
  await Promise.all([
    ...[...keys].map((key) => ctx.scheduler.runAfter(0, internal.backgroundPresets.recapture, { key, cursor: null })),
    ...[...families].map(([key, regions]) =>
      ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureFamily, {
        key,
        regions: [...regions],
        cursor: null,
      })
    ),
    ...[...backs].map((key) => ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureBack, { key })),
  ]);
}
