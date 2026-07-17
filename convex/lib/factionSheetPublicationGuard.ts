import type { MutationCtx, QueryCtx } from '../types';
import { FACTION_SHEET_ASSET_TYPE } from './factionSheetTargets';

export const MAX_FIRST_PUBLISHED_FACTION_SHEETS = 875;
export const FACTION_SHEET_PUBLICATION_COUNTER_KEY =
  'asset_publisher:faction_sheet:first_publications' as const;
export const FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE =
  'faction_sheet_targets_verify_v1' as const;
export const FACTION_SHEET_STORAGE_ACTIVATION_PREREQUISITE =
  'faction_sheet_publication_admissions_v1' as const;

type ReadCtx = Pick<QueryCtx, 'db'>;

export async function exactPublisherStateOrNull(ctx: ReadCtx) {
  const states = await ctx.db
    .query('asset_publisher_state')
    .withIndex('by_key', (q) => q.eq('key', 'singleton'))
    .take(2);
  if (states.length > 1) {
    throw new Error('Asset publisher invariant violated: duplicate publisher singletons');
  }
  return states[0] ?? null;
}

export async function exactFirstPublicationCounterOrNull(ctx: ReadCtx) {
  const counters = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', FACTION_SHEET_PUBLICATION_COUNTER_KEY))
    .take(2);
  if (counters.length > 1) {
    throw new Error('Asset publisher invariant violated: duplicate first-publication counters');
  }
  return counters[0] ?? null;
}

export function validFirstPublicationCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_FIRST_PUBLISHED_FACTION_SHEETS;
}

export async function insertDisabledPublisherState(ctx: MutationCtx) {
  const id = await ctx.db.insert('asset_publisher_state', {
    key: 'singleton',
    status: 'disabled',
    cooldown_until: 0,
    daily_browser_utc_date: new Date(Date.now()).toISOString().slice(0, 10),
    daily_browser_ms: 0,
    next_lane: 'foreground',
  });
  const state = await ctx.db.get('asset_publisher_state', id);
  if (!state) throw new Error('Failed to initialize disabled publisher singleton');
  return state;
}

export async function ensureDisabledPublisherState(ctx: MutationCtx) {
  const state = await exactPublisherStateOrNull(ctx);
  if (state) {
    if (state.status !== 'disabled') {
      throw new Error(
        `First-publication counter initialization requires disabled publisher state; found ${state.status}`
      );
    }
    return state;
  }
  return await insertDisabledPublisherState(ctx);
}

async function boundedPublicationFootprint(ctx: ReadCtx) {
  const [admitted, published] = await Promise.all([
    ctx.db
      .query('asset_targets')
      .withIndex('by_asset_type_and_admitted_and_status_and_next_eligible_at', (q) =>
        q.eq('asset_type', FACTION_SHEET_ASSET_TYPE).eq('first_publication_admitted', true)
      )
      .take(MAX_FIRST_PUBLISHED_FACTION_SHEETS + 1),
    ctx.db
      .query('asset_targets')
      .withIndex('by_asset_type_and_published_generation', (q) =>
        q.eq('asset_type', FACTION_SHEET_ASSET_TYPE).gte('published_generation', 1)
      )
      .take(MAX_FIRST_PUBLISHED_FACTION_SHEETS + 1),
  ]);
  const targetIds = new Set([...admitted, ...published].map((target) => target._id));
  if (targetIds.size > MAX_FIRST_PUBLISHED_FACTION_SHEETS) {
    throw new Error(
      `Faction-sheet first-publication footprint exceeds ${MAX_FIRST_PUBLISHED_FACTION_SHEETS}`
    );
  }
  return targetIds.size;
}

/**
 * Initializes the persisted counter from a bounded union of already-admitted
 * and already-published targets. Callers must establish disabled state first.
 */
export async function initializeFirstPublicationCounterDisabled(ctx: MutationCtx) {
  const state = await exactPublisherStateOrNull(ctx);
  if (state?.status !== 'disabled') {
    throw new Error('First-publication counter initialization requires disabled publisher state');
  }
  const footprint = await boundedPublicationFootprint(ctx);
  const counter = await exactFirstPublicationCounterOrNull(ctx);
  if (counter) {
    if (!validFirstPublicationCount(counter.value) || counter.value !== footprint) {
      throw new Error('First-publication counter does not match the bounded publication footprint');
    }
    return counter;
  }
  const id = await ctx.db.insert('counters', {
    key: FACTION_SHEET_PUBLICATION_COUNTER_KEY,
    value: footprint,
  });
  const inserted = await ctx.db.get('counters', id);
  if (!inserted) throw new Error('Failed to initialize first-publication counter');
  return inserted;
}

export async function assertFirstPublicationCounterReady(ctx: ReadCtx) {
  const [counter, admitted] = await Promise.all([
    exactFirstPublicationCounterOrNull(ctx),
    ctx.db
      .query('asset_targets')
      .withIndex('by_asset_type_and_admitted_and_status_and_next_eligible_at', (q) =>
        q.eq('asset_type', FACTION_SHEET_ASSET_TYPE).eq('first_publication_admitted', true)
      )
      .take(MAX_FIRST_PUBLISHED_FACTION_SHEETS + 1),
  ]);
  if (!counter || !validFirstPublicationCount(counter.value) || admitted.length !== counter.value) {
    throw new Error('First-publication counter is missing, invalid, or inconsistent');
  }
  return counter;
}
