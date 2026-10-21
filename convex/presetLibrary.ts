import { zodToConvex } from 'convex-helpers/server/zod4';
import { ConvexError, v } from 'convex/values';
import { z } from 'zod';

import { cardbackPresetKeySchema } from '../src/shared/assets/cardbackPresetKeys';
import { cardbackPresetSchema } from '../src/shared/assets/cardbackPresets';
import {
  INITIAL_CARD_FRONT_PRESETS,
  CARD_FRONT_PUBLICATION_REVISIONS,
  cardFrontPresetType,
  cardFrontPresetSchema,
} from '../src/shared/assets/cardFrontPresets';
import type { AuthoredCardFrontStyle } from '../src/shared/assets/cardFrontPresets';
import { CustomCardTokens } from '../src/shared/assets/schema';
import { backgroundPresets } from '../src/shared/backgrounds/defaults';
import {
  familyPresetSchema,
  familySaveSchema,
  discoveryPresetSchema,
  discoverySaveSchema,
  INITIAL_DISCOVERY_PRESETS,
} from '../src/shared/backgrounds/families';
import type { FamilyPreset } from '../src/shared/backgrounds/families';
import { backgroundPresetSchema } from '../src/shared/backgrounds/schema';
import type { BackgroundData } from '../src/shared/backgrounds/schema';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { storeBackgroundPreset } from './backgroundPresets';
import { mutation, publicQuery } from './functions';
import {
  assertBackgroundCapacity,
  backgroundProjection,
  preserveVirtualBackgrounds,
  resolveBackgrounds,
  listBackgroundPresets,
  validateBackgroundLinks,
} from './lib/backgroundPresets';
import { canonicalJson } from './lib/canonicalJson';
import { listCardbackPresets, storeCardbackPreset } from './lib/cardbackPresets';
import { listCardFrontPresets } from './lib/cardFrontPresets';
import { rawCardbackPreset } from './lib/cardPresetDefaults';
import { resolveCustomCardTokens } from './lib/customCardTokens';
import { requireAdminUserId } from './lib/policy';
import { publicationSettings } from './lib/publication';
import type { QueryCtx, MutationCtx } from './types';
type SaveFamily = z.infer<typeof familySaveSchema>;
type Discovery = z.infer<typeof discoveryPresetSchema>;

export function backgroundLink(value: BackgroundData, key: string): BackgroundData {
  return value.source ? value : { ...value, source: { kind: 'preset', key } };
}
function linkedStyle(style: AuthoredCardFrontStyle, key: string): AuthoredCardFrontStyle {
  return {
    head: backgroundLink(style.head, `front/${key}/header`),
    iconBackground: style.iconBackground ? backgroundLink(style.iconBackground, `front/${key}/icon`) : null,
  };
}
function familyBackKey(key: string) {
  return cardbackPresetKeySchema.parse(key.startsWith('treachery-') ? 'treachery' : key);
}
async function familyFor(ctx: QueryCtx, initial: (typeof INITIAL_CARD_FRONT_PRESETS)[number]): Promise<FamilyPreset> {
  const backKey = familyBackKey(initial.key);
  const [row, back] = await Promise.all([
    ctx.db
      .query('card_front_presets')
      .withIndex('by_key', (q) => q.eq('key', initial.key))
      .unique(),
    rawCardbackPreset(ctx, backKey),
  ]);
  return {
    key: initial.key,
    label: initial.label,
    style: linkedStyle(row?.style ?? initial.style, initial.key),
    frontRevision: row?.revision ?? 0,
    backKey,
    cardback: { ...back.cardback, background: backgroundLink(back.cardback.background, `back/${backKey}`) },
    backRevision: back.revision,
  };
}
async function discoveryFor(ctx: QueryCtx, initial: (typeof INITIAL_DISCOVERY_PRESETS)[number]): Promise<Discovery> {
  const row = await ctx.db
    .query('discovery_presets')
    .withIndex('by_key', (q) => q.eq('key', initial.key))
    .unique();
  const saved = row ?? initial;
  return {
    key: initial.key,
    label: initial.label,
    revision: saved.revision,
    front: { ...saved.front, background: backgroundLink(saved.front.background, `${initial.key}/front`) },
    back: { ...saved.back, background: backgroundLink(saved.back.background, `${initial.key}/back`) },
  };
}
const discoveries = (ctx: QueryCtx) =>
  Promise.all(INITIAL_DISCOVERY_PRESETS.map((initial) => discoveryFor(ctx, initial)));

export const page = publicQuery({
  args: {},
  returns: zodToConvex(
    z.strictObject({
      families: z.array(familyPresetSchema),
      discovery: z.array(discoveryPresetSchema),
      backgrounds: z.array(backgroundPresetSchema),
    })
  ),
  handler: async (ctx) => {
    const [families, discovery, backgrounds] = await Promise.all([
      Promise.all(INITIAL_CARD_FRONT_PRESETS.map((initial) => familyFor(ctx, initial))),
      discoveries(ctx),
      listBackgroundPresets(ctx),
    ]);
    return { families, discovery, backgrounds };
  },
});

async function assertFamilyReady(ctx: MutationCtx, args: SaveFamily) {
  await requireAdminUserId(ctx);
  const type = cardFrontPresetType(args.key);
  if (((await publicationSettings(ctx))?.renderer_revisions[type] ?? 0) < CARD_FRONT_PUBLICATION_REVISIONS[type]) {
    throw new ConvexError('Preset publication is not ready yet. Try again after the release finishes.');
  }
  if (familyBackKey(args.key) !== args.backKey) {
    throw new ConvexError('Check the family preset fields.');
  }
  if (args.style.iconBackground === null && args.key !== 'nexus') {
    throw new ConvexError('Check the family preset fields.');
  }
}
function changedFamilySlots(args: SaveFamily, previous: AuthoredCardFrontStyle, back: BackgroundData) {
  const before = linkedStyle(previous, args.key);
  const slots = [
    { key: `front/${args.key}/header`, before: before.head, after: args.style.head },
    { key: `front/${args.key}/icon`, before: before.iconBackground, after: args.style.iconBackground },
    {
      key: `back/${args.backKey}`,
      before: backgroundLink(back, `back/${args.backKey}`),
      after: args.cardback.background,
    },
  ];
  return slots.filter((slot) => canonicalJson(slot.before) !== canonicalJson(slot.after)).map((slot) => slot.key);
}
async function saveEditedBackgrounds(ctx: MutationCtx, backgrounds: z.infer<typeof backgroundPresetSchema>[]) {
  await Promise.all(backgrounds.map((background) => storeBackgroundPreset(ctx, background)));
  /* Several new definitions share this transaction, so enforce capacity again after all inserts. */
  await assertBackgroundCapacity(ctx);
}
async function saveFamilyFront(
  ctx: MutationCtx,
  row: Doc<'card_front_presets'> | null,
  args: SaveFamily,
  previous: AuthoredCardFrontStyle,
  changing: string[]
) {
  if (canonicalJson(args.style) === canonicalJson(linkedStyle(previous, args.key))) {
    return;
  }
  const fields = { key: args.key, style: args.style, revision: args.frontRevision + 1, updated_at: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, fields);
  } else {
    await ctx.db.insert('card_front_presets', fields);
  }
  await resolveBackgrounds(ctx, args.style);
  const regions = changing
    .filter((key) => key.startsWith('front/'))
    .map((key) => (key.endsWith('/header') ? ('header' as const) : ('icon' as const)));
  await ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureFamily, { key: args.key, regions, cursor: null });
}
async function saveFamilyBack(ctx: MutationCtx, args: SaveFamily, back: Awaited<ReturnType<typeof rawCardbackPreset>>) {
  const baseline = { ...back.cardback, background: backgroundLink(back.cardback.background, `back/${args.backKey}`) };
  if (canonicalJson(args.cardback) !== canonicalJson(baseline)) {
    await storeCardbackPreset(ctx, args.backKey, args.cardback, args.backRevision);
  }
}
export const saveFamily = mutation({
  args: zodToConvex(familySaveSchema).fields,
  returns: v.null(),
  handler: async (ctx, input) => {
    const args = familySaveSchema.parse(input);
    await assertFamilyReady(ctx, args);
    const [row, back] = await Promise.all([
      ctx.db
        .query('card_front_presets')
        .withIndex('by_key', (q) => q.eq('key', args.key))
        .unique(),
      rawCardbackPreset(ctx, args.backKey),
    ]);
    if ((row?.revision ?? 0) !== args.frontRevision || back.revision !== args.backRevision) {
      throw new ConvexError('This family changed elsewhere. Reset to load the saved version.');
    }
    const previous = row?.style ?? INITIAL_CARD_FRONT_PRESETS.find((preset) => preset.key === args.key)!.style;
    const changing = changedFamilySlots(args, previous, back.cardback.background);
    await preserveVirtualBackgrounds(ctx, changing);
    await saveEditedBackgrounds(ctx, args.backgrounds);
    await validateBackgroundLinks(ctx, args.style);
    await validateBackgroundLinks(ctx, args.cardback);
    await saveFamilyFront(ctx, row, args, previous, changing);
    await saveFamilyBack(ctx, args, back);
    return null;
  },
});
export const saveDiscovery = mutation({
  args: zodToConvex(discoverySaveSchema).fields,
  returns: v.null(),
  handler: async (ctx, input) => {
    await requireAdminUserId(ctx);
    const args = discoverySaveSchema.parse(input);
    const row = await ctx.db
      .query('discovery_presets')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .unique();
    if ((row?.revision ?? 0) !== args.revision) {
      throw new ConvexError('This preset changed elsewhere. Reset to load the saved version.');
    }
    await preserveVirtualBackgrounds(ctx, [`${args.key}/front`, `${args.key}/back`]);
    await saveEditedBackgrounds(ctx, args.backgrounds);
    await validateBackgroundLinks(ctx, args);
    const { backgrounds: _backgrounds, ...preset } = args;
    const fields = { ...preset, revision: args.revision + 1, updated_at: Date.now() };
    if (row) {
      await ctx.db.patch(row._id, fields);
    } else {
      await ctx.db.insert('discovery_presets', fields);
    }
    await resolveBackgrounds(ctx, args);
    return null;
  },
});

/** Create pages read current standards and their draft's embedded token faces together. */
export const authoring = publicQuery({
  args: { ids: v.optional(v.array(v.id('assets'))) },
  returns: zodToConvex(
    z.strictObject({
      backs: z.array(cardbackPresetSchema),
      fronts: z.array(cardFrontPresetSchema),
      backgrounds: z.array(backgroundPresetSchema),
      discovery: z.array(discoveryPresetSchema),
      tokens: CustomCardTokens,
      error: z.string().nullable(),
    })
  ),
  handler: async (ctx, args) => {
    const discovery = await discoveries(ctx);
    return {
      backs: await listCardbackPresets(ctx),
      fronts: await listCardFrontPresets(ctx),
      backgrounds: await backgroundProjection(ctx, [
        discovery,
        backgroundPresets.special,
        backgroundPresets.ecaz,
        backgroundPresets.atreides,
      ]),
      discovery,
      ...(await resolveCustomCardTokens(ctx, args.ids ?? [])),
    };
  },
});
