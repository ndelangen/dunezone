import { zodToConvex } from 'convex-helpers/server/zod4';
import { ConvexError, v } from 'convex/values';
import { z } from 'zod';

import { cardbackPresetKeySchema } from '../src/shared/assets/cardbackPresetKeys';
import { cardbackPresetSchema } from '../src/shared/assets/cardbackPresets';
import { cardFrontPresetSchema } from '../src/shared/assets/cardFrontPresets';
import {
  INITIAL_CARD_FRONT_PRESETS,
  CARD_FRONT_PUBLICATION_REVISIONS,
  cardFrontPresetType,
} from '../src/shared/assets/cardFrontPresets';
import type { AuthoredCardFrontStyle } from '../src/shared/assets/cardFrontPresets';
import { CustomCardTokens } from '../src/shared/assets/schema';
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
import { storeBackgroundPreset } from './backgroundPresets';
import { mutation, publicQuery } from './functions';
import { preserveVirtualBackgrounds } from './lib/backgroundPresets';
import { resolveBackgrounds } from './lib/backgroundPresets';
import { listBackgroundPresets, validateBackgroundLinks } from './lib/backgroundPresets';
import { canonicalJson } from './lib/canonicalJson';
import { listCardbackPresets } from './lib/cardbackPresets';
import { storeCardbackPreset } from './lib/cardbackPresets';
import { listCardFrontPresets } from './lib/cardFrontPresets';
import { rawCardbackPreset } from './lib/cardPresetDefaults';
import { resolveCustomCardTokens } from './lib/customCardTokens';
import { requireAdminUserId } from './lib/policy';
import { publicationSettings } from './lib/publication';

export function backgroundLink(value: BackgroundData, key: string): BackgroundData {
  return value.source ? value : { ...value, source: { kind: 'preset', key } };
}
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
    const families: FamilyPreset[] = [];
    for (const initial of INITIAL_CARD_FRONT_PRESETS) {
      const row = await ctx.db
        .query('card_front_presets')
        .withIndex('by_key', (q) => q.eq('key', initial.key))
        .unique();
      const authored: AuthoredCardFrontStyle = row?.style ?? initial.style;
      const backKey = cardbackPresetKeySchema.parse(initial.key.startsWith('treachery-') ? 'treachery' : initial.key);
      const back = await rawCardbackPreset(ctx, backKey);
      families.push({
        key: initial.key,
        label: initial.label,
        style: {
          head: backgroundLink(authored.head, `front/${initial.key}/header`),
          iconBackground: authored.iconBackground
            ? backgroundLink(authored.iconBackground, `front/${initial.key}/icon`)
            : null,
        },
        frontRevision: row?.revision ?? 0,
        backKey,
        cardback: { ...back.cardback, background: backgroundLink(back.cardback.background, `back/${backKey}`) },
        backRevision: back.revision,
      });
    }
    const discovery = await Promise.all(
      INITIAL_DISCOVERY_PRESETS.map(async (initial) => {
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
      })
    );
    return { families, discovery, backgrounds: await listBackgroundPresets(ctx) };
  },
});

export const saveFamily = mutation({
  args: zodToConvex(familySaveSchema).fields,
  returns: v.null(),
  handler: async (ctx, input) => {
    await requireAdminUserId(ctx);
    const args = familySaveSchema.parse(input);
    const type = cardFrontPresetType(args.key);
    if (((await publicationSettings(ctx))?.renderer_revisions[type] ?? 0) < CARD_FRONT_PUBLICATION_REVISIONS[type]) {
      throw new ConvexError('Preset publication is not ready yet. Try again after the release finishes.');
    }
    const expectedBack = args.key.startsWith('treachery-') ? 'treachery' : args.key;
    if (expectedBack !== args.backKey || (args.style.iconBackground === null && args.key !== 'nexus')) {
      throw new ConvexError('Check the family preset fields.');
    }
    const row = await ctx.db
      .query('card_front_presets')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .unique();
    const back = await rawCardbackPreset(ctx, args.backKey);
    if ((row?.revision ?? 0) !== args.frontRevision || back.revision !== args.backRevision) {
      throw new ConvexError('This family changed elsewhere. Reset to load the saved version.');
    }
    const previousStyle: AuthoredCardFrontStyle =
      row?.style ?? INITIAL_CARD_FRONT_PRESETS.find((preset) => preset.key === args.key)!.style;
    const changing = [];
    if (
      canonicalJson(backgroundLink(previousStyle.head, `front/${args.key}/header`)) !== canonicalJson(args.style.head)
    ) {
      changing.push(`front/${args.key}/header`);
    }
    if (
      canonicalJson(
        previousStyle.iconBackground ? backgroundLink(previousStyle.iconBackground, `front/${args.key}/icon`) : null
      ) !== canonicalJson(args.style.iconBackground)
    ) {
      changing.push(`front/${args.key}/icon`);
    }
    if (
      canonicalJson(backgroundLink(back.cardback.background, `back/${args.backKey}`)) !==
      canonicalJson(args.cardback.background)
    ) {
      changing.push(`back/${args.backKey}`);
    }
    await preserveVirtualBackgrounds(ctx, changing);
    for (const background of args.backgrounds) {
      await storeBackgroundPreset(ctx, background);
    }
    await validateBackgroundLinks(ctx, args.style);
    await validateBackgroundLinks(ctx, args.cardback);
    const initial = INITIAL_CARD_FRONT_PRESETS.find((preset) => preset.key === args.key)!;
    const authored: AuthoredCardFrontStyle = row?.style ?? initial.style;
    const baseline = {
      head: backgroundLink(authored.head, `front/${args.key}/header`),
      iconBackground: authored.iconBackground
        ? backgroundLink(authored.iconBackground, `front/${args.key}/icon`)
        : null,
    };

    if (canonicalJson(args.style) !== canonicalJson(baseline)) {
      const fields = { key: args.key, style: args.style, revision: args.frontRevision + 1, updated_at: Date.now() };
      if (row) {
        await ctx.db.patch(row._id, fields);
      } else {
        await ctx.db.insert('card_front_presets', fields);
      }
      await resolveBackgrounds(ctx, {
        head: backgroundLink(args.style.head, `front/${args.key}/header`),
        iconBackground: args.style.iconBackground,
      });
      await ctx.scheduler.runAfter(0, internal.backgroundPresets.recaptureFamily, {
        key: args.key,
        regions: changing
          .filter((key) => key.startsWith('front/'))
          .map((key) => (key.endsWith('/header') ? ('header' as const) : ('icon' as const))),
        cursor: null,
      });
    }
    const baselineBack = {
      ...back.cardback,
      background: backgroundLink(back.cardback.background, `back/${args.backKey}`),
    };
    if (canonicalJson(args.cardback) !== canonicalJson(baselineBack)) {
      await storeCardbackPreset(ctx, args.backKey, args.cardback, args.backRevision);
    }

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
    for (const background of args.backgrounds) {
      await storeBackgroundPreset(ctx, background);
    }
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
  handler: async (ctx, args) => ({
    backs: await listCardbackPresets(ctx),
    fronts: await listCardFrontPresets(ctx),
    backgrounds: await listBackgroundPresets(ctx),
    discovery: await Promise.all(
      INITIAL_DISCOVERY_PRESETS.map(async (initial) => {
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
      })
    ),
    ...(await resolveCustomCardTokens(ctx, args.ids ?? [])),
  }),
});
