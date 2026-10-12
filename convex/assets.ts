import { zodToConvex } from 'convex-helpers/server/zod4';
import type { Infer } from 'convex/values';
import { ConvexError, v } from 'convex/values';

import { NO_DECK_BACK_HREF } from '../src/shared/asset-publishing/fallbacks';
import {
  isPublicationAssetType,
  PUBLICATION_TARGETS,
  publicationFaceId,
  publishedHref,
} from '../src/shared/asset-publishing/publicationTargets';
import { cardbackPresetSchema } from '../src/shared/assets/cardbackPresets';
import { GF9_LEADER_SKILLS, GF9_LEADER_SKILL_DECK } from '../src/shared/assets/gf9LeaderSkills';
import { GF9_NEXUS_CARDS, GF9_NEXUS_DECK } from '../src/shared/assets/gf9Nexus';
import { GF9_STRONGHOLD_CARDS, GF9_STRONGHOLD_DECK } from '../src/shared/assets/gf9StrongholdDeck';
import {
  StormCardAssetInput,
  DeckAssetInput,
  StrongholdCardAsset,
  LeaderSkillAssetInput,
} from '../src/shared/assets/schema';
import { CustomCardTokens, CustomCardTokenResolution } from '../src/shared/assets/schema';
import { STANDARD_STORM_CARDS, STANDARD_STORM_CARDBACK } from '../src/shared/assets/standardStormDeck';
import { treacheryToCustomCard } from '../src/shared/assets/treacheryToCustomCard';
import { ASSET_TYPE_KEYS } from '../src/shared/assets/types';
import { parseAssetDataForWrite, parseNexusCardInput } from '../src/shared/assets/validation';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { publicationStatusFor } from './assetPublishingStatus';
import { internalMutation, mutation, publicQuery, viewerQuery } from './functions';
import { optionalActiveUserId } from './lib/accountLifecycle';
import {
  assertReferenceableDeckCardback,
  assertReferenceableTokenBack,
  authoredDeckCardback,
  deckCardbackOf,
  legacyRelationBackId,
  resolveBackHref,
  TOKEN_ASSET_TYPES,
  tokenBackOf,
} from './lib/assetBacks';
import { assertKnownAssetType, assetDisplayName } from './lib/assetInput';
import { listCardbackPresets, presetFromKey, storeCardbackPreset } from './lib/cardbackPresets';
import type { CardbackPresetMemo } from './lib/cardbackPresets';
import {
  loadAssetAccessBundle,
  requireAssetSoftDelete,
  requireAssetUpdate,
  requireGroupReassignment,
} from './lib/collaborativeAccess';
import {
  assetPublishingValidator,
  assetViewerAccessValidator,
  assignedGroupSummaryValidator,
} from './lib/collaborativeAccessValidators';
import {
  CUSTOM_CARD_TOKEN_RELATION,
  customCardTokenIds,
  resolveCustomCardTokens,
  syncCustomCardTokenRelations,
  validateCustomCardTokens,
} from './lib/customCardTokens';
import { parseStoredFactionForRead } from './lib/factionInput';
import { requireAdminUserId, requireAuthUserId } from './lib/policy';
import { profileSummary } from './lib/profileSummary';
import { enqueueAssetPublication, supersedePendingPublication } from './lib/publication';
import { allocateCounterSlug } from './lib/slugCounters';
import { nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

/**
 * Listing entry for catalogue surfaces.
 * `data` passes through untyped while `name` is lifted server-side so every surface agrees on the fallback.
 * Per-type Zod schemas live with the editors, and listing renderers parse defensively.
 */
const assetListEntryValidator = v.object({
  id: v.id('assets'),
  type: v.string(),
  slug: v.string(),
  name: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  owner: v.union(
    v.object({
      id: v.id('profiles'),
      slug: v.string(),
      username: v.union(v.string(), v.null()),
      avatar_url: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
  data: v.any(),
  previewHref: v.union(v.string(), v.null()),
  authoredBackHref: v.union(v.string(), v.null()),
});

function nameOf(row: Doc<'assets'>): string {
  return assetDisplayName(row);
}

/**
 * The presentation opt-in for list surfaces, and nothing else.
 * Passing it is what turns a reference-mode deck's `data` into the target's composition;
 * `getPage` and every other caller must NOT pass it, because an editor reading presented data would take the target's composition for the row's own and persist the copy on save.
 */
type DeckBackPresentation = { deckBacks: Map<Id<'assets'>, Doc<'assets'> | null> };

/**
 * Reads shared across the rows of one query, so a caller reading hundreds of rows pays per owner and per Cardback preset rather than per row.
 * Unlike `DeckBackPresentation` these change what an entry costs and never what it says, so `getPage` passes `presets` too.
 */
type ListEntryMemos = {
  owners?: Map<Id<'users'>, Awaited<ReturnType<typeof profileSummary>>>;
  presets?: CardbackPresetMemo;
};

async function toListEntry(
  ctx: QueryCtx,
  row: Doc<'assets'>,
  { owners, presets = new Map() }: ListEntryMemos = {},
  presentation?: DeckBackPresentation
) {
  if (owners && !owners.has(row.owner_id)) {
    owners.set(row.owner_id, await profileSummary(ctx, row.owner_id));
  }
  const appearance = await presentedAppearance(ctx, row, presentation?.deckBacks ?? new Map(), presets);
  return {
    id: row._id,
    type: row.type,
    slug: row.slug,
    name: nameOf(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner: owners ? owners.get(row.owner_id)! : await profileSummary(ctx, row.owner_id),
    data: presentation ? appearance.data : row.data,
    previewHref: appearance.href,
    authoredBackHref:
      TOKEN_ASSET_TYPES.has(row.type) && isPublicationAssetType(row.type) && tokenBackOf(row.data)?.mode === 'custom'
        ? publishedHref(row.type, publicationFaceId(row._id, 'back'), row.updated_at)
        : null,
  };
}

/**
 * Resolve a saved face and its listing data without changing the editor's stored data.
 * A referenced deck uses its target's authored cardback and publication, including the target's cache token.
 * Target reads are memoized within the query, and references are only one level deep.
 * A dangling reference uses the shared no-cardback image and presents `cardback: null` to existing callers.
 */
async function presentedAppearance(
  ctx: QueryCtx,
  row: Doc<'assets'>,
  deckBacks: Map<Id<'assets'>, Doc<'assets'> | null>,
  presets: CardbackPresetMemo
) {
  const href = isPublicationAssetType(row.type) ? publishedHref(row.type, row._id, row.updated_at) : null;
  if (row.type !== 'deck') {
    return { data: row.data, href };
  }
  const cardback = deckCardbackOf(row.data);
  if (cardback?.mode === 'preset') {
    const preset = await presetFromKey(ctx, cardback.key, presets);
    return { data: { ...row.data, cardback: preset?.cardback ?? null }, href: preset?.href ?? null };
  }
  if (!cardback || cardback.mode !== 'reference') {
    return { data: row.data, href: authoredDeckCardback(row) ? href : null };
  }
  const targetId = typeof cardback.asset_id === 'string' ? (cardback.asset_id as Id<'assets'>) : null;
  let target: Doc<'assets'> | null = null;
  if (targetId) {
    if (deckBacks.has(targetId)) {
      target = deckBacks.get(targetId) ?? null;
    } else {
      target = await ctx.db.get('assets', targetId);
      deckBacks.set(targetId, target);
    }
  }
  const composition = target ? authoredDeckCardback(target) : null;
  return {
    data: { ...(row.data as Record<string, unknown>), cardback: composition },
    href: target && composition ? publishedHref('deck', target._id, target.updated_at) : NO_DECK_BACK_HREF,
  };
}

/* Enough for the deepest pile: the masthead fan draws five, the token stacks four. */
const RECENT_PER_TYPE = 5;
const PER_TYPE_LIMIT = 200;

/**
 * The `/assets` landing: the newest few assets of every type.
 * It carried per-type counts over a thousand-row scan until the landing stopped showing numbers, a pile being its art and its name (Norbert, 2026-08-21), so now it reads exactly the rows it draws.
 * Per type rather than one newest-overall window, because a shared window starves quiet types: a burst of new cards would push an older type out entirely and its pile would claim "none yet" about assets that exist.
 */
export const cataloguePage = publicQuery({
  args: {},
  returns: v.object({
    recent: v.array(assetListEntryValidator),
  }),
  handler: async (ctx) => {
    const rows: Doc<'assets'>[] = [];
    for (const type of ASSET_TYPE_KEYS) {
      rows.push(
        ...(await ctx.db
          .query('assets')
          .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
          .order('desc')
          .take(RECENT_PER_TYPE))
      );
    }
    rows.sort((a, b) => b._creationTime - a._creationTime);

    /* Sequential like the other list readers, so the memos fill before the rows that would hit them. */
    const deckBacks = new Map<Id<'assets'>, Doc<'assets'> | null>();
    const owners = new Map<Id<'users'>, Awaited<ReturnType<typeof profileSummary>>>();
    const presets: CardbackPresetMemo = new Map();
    const recent = [];
    for (const row of rows) {
      recent.push(await toListEntry(ctx, row, { owners, presets }, { deckBacks }));
    }
    return { recent };
  },
});

/** A category browse page: the caller names the flat Asset types its category derives to. */
export const listByTypes = publicQuery({
  args: { types: v.array(v.string()) },
  returns: v.array(assetListEntryValidator),
  handler: async (ctx, args) => {
    const perType = await Promise.all(
      args.types.map((type) =>
        ctx.db
          .query('assets')
          .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
          .order('desc')
          .take(PER_TYPE_LIMIT)
      )
    );
    const rows = perType.flat().sort((a, b) => b._creationTime - a._creationTime);
    /* Sequential rather than Promise.all, so the memos fill before the rows that would hit them. */
    const owners = new Map<Id<'users'>, Awaited<ReturnType<typeof profileSummary>>>();
    const deckBacks = new Map<Id<'assets'>, Doc<'assets'> | null>();
    const presets: CardbackPresetMemo = new Map();
    const entries = [];
    for (const row of rows) {
      entries.push(await toListEntry(ctx, row, { owners, presets }, { deckBacks }));
    }
    return entries;
  },
});

/** One deck naming an asset it holds, and how many copies. */
const deckReferenceValidator = v.object({
  id: v.id('assets'),
  type: v.string(),
  slug: v.string(),
  name: v.string(),
  count: v.number(),
});

type DeckReference = Infer<typeof deckReferenceValidator>;

/**
 * One Asset's whole page, for both the routes that show one.
 *
 * The detail page and the edit page take the same bundle, the way `loadRulesetDetailPage` already serves both ruleset routes.
 * They want the same things for the same reasons: the toolbars are the same toolbar (management actions live on the detail page *and* the edit page), so both need `viewerAccess` and `assignableGroups`, and both draw the asset itself.
 *
 * Nothing here is access-gated.
 * `loadAssetAccessBundle` reads the viewer without demanding one, so an anonymous reader gets the full bundle with every capability false, which is what makes this serve a public page.
 * A soft-deleted asset reads as absent: its slug stays reserved so the address survives, but nothing behind it is a viewer's to see, and the pages render the same body they would for a slug that never existed.
 */
/**
 * A ruleset as a slotted asset's page cites it: enough to name it, link to it, and say which slot it fills.
 * No owner, deliberately.
 * That would be a `profiles` read per row for a name the section does not draw.
 */
const rulesetSlotReferenceValidator = v.object({
  id: v.id('rulesets'),
  slug: v.string(),
  name: v.string(),
  slot: v.string(),
});

export const getPage = viewerQuery({
  args: { type: v.string(), slug: v.string(), embeddedTokenIds: v.optional(v.array(v.id('assets'))) },
  returns: v.union(
    v.null(),
    v.object({
      asset: assetListEntryValidator,
      cardTokens: v.optional(zodToConvex(CustomCardTokens)),
      cardTokensError: v.optional(v.union(v.string(), v.null())),
      canConvertToCustom: v.boolean(),
      cardbackPresets: v.array(zodToConvex(cardbackPresetSchema)),
      viewerAccess: assetViewerAccessValidator,
      assignableGroups: v.array(assignedGroupSummaryValidator),
      /** The token serving as this one's backside, for the types that have one. Null covers both "custom back" and "none". */
      backToken: v.union(assetListEntryValidator, v.null()),
      /** The deck whose authored cardback this one wears, the deck analog of `backToken`. Null covers authored, transitional bare, and dangling alike. */
      backDeck: v.union(assetListEntryValidator, v.null()),
      /**
       * What a container holds, with counts.
       * Empty for every type that holds nothing.
       * One field rather than one per container kind: a deck's cards and a bundle's tokens are the same relation read with a different `kind`, and the page's per-type body already knows which it is looking at.
       */
      members: v.array(v.object({ member: assetListEntryValidator, count: v.number() })),
      membersTruncated: v.boolean(),
      /** The decks holding this asset. Empty for a deck, which nothing may hold. */
      inDecks: v.array(deckReferenceValidator),
      /**
       * The bundles holding this asset, the same shape and the same question one container kind over.
       * Empty for every type a bundle cannot hold, which is everything but tokens.
       * Its own field rather than merged into `inDecks`, because "in no deck" and "in no bundle" are different sentences and a page that ran them together could not say either.
       */
      inBundles: v.array(deckReferenceValidator),
      /**
       * The rulesets that slot this asset, and which slot each one puts it in.
       * Read-only here: slots are managed on the ruleset edit page, per «Ruleset deck-slot residual semantics».
       * Empty for every type a ruleset cannot slot, which is everything but decks and bundles.
       */
      linkingRulesets: v.array(rulesetSlotReferenceValidator),
      /** Null for a type that publishes nothing, which today is a bundle and every planned type. */
      assetPublishing: v.union(assetPublishingValidator, v.null()),
      /**
       * The authored back's own publication, which is a second artifact under a face-qualified id rather than a second field on the first.
       * Null when the type has no second face, or when the back is a reference and therefore publishes nothing of its own.
       * A sidecar rather than a widening of `assetPublishingValidator`, because that validator also types the faction page's publication, which is a single one and gains nothing from learning about faces.
       */
      backPublishing: v.union(assetPublishingValidator, v.null()),
      /**
       * The one server-side answer to "what is this asset's back?" («What does each back mode publish»): the mode the resolution took and the URL a consumer fetches for it, or null for a type with no back.
       * Additive this release;
       * the pages that draw from it land with the editor slice.
       */
      resolvedBack: v.union(v.object({ mode: v.string(), href: v.union(v.string(), v.null()) }), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const row = await liveAsset(ctx, args.type, args.slug);
    if (!row) {
      return null;
    }
    const access = await loadAssetAccessBundle(ctx, { kind: 'asset', row });
    const back = TOKEN_TYPES.has(row.type) ? await tokenBackFor(ctx, row._id, row.data) : null;
    const backDeckRow = await referencedCardbackDeck(ctx, row);
    /* The entry, the preset list and the resolved back all ask for presets; one memo reads each once. */
    const presets: CardbackPresetMemo = new Map();
    const resolvedTokens =
      row.type === 'card-custom' || row.type === 'card-storm'
        ? await resolveCustomCardTokens(ctx, args.embeddedTokenIds ?? customCardTokenIds(row.data))
        : null;
    return {
      asset: await toListEntry(ctx, row, { presets }),
      canConvertToCustom: await canConvertTreachery(ctx, row.type),
      ...(resolvedTokens ? { cardTokens: resolvedTokens.tokens, cardTokensError: resolvedTokens.error } : {}),
      cardbackPresets: row.type === 'deck' ? await listCardbackPresets(ctx, presets) : [],
      viewerAccess: access.viewerAccess,
      assignableGroups: access.assignableGroups,
      backToken: back ? await toListEntry(ctx, back) : null,
      backDeck: backDeckRow ? await toListEntry(ctx, backDeckRow) : null,
      ...(CONTAINER_KINDS[row.type]
        ? await membersOf(ctx, row._id, CONTAINER_KINDS[row.type]!.kind).then(async (m) => ({
            members: await Promise.all(
              m.entries.map(async ({ row: member, count }) => ({ member: await toListEntry(ctx, member), count }))
            ),
            membersTruncated: m.truncated,
          }))
        : { members: [], membersTruncated: false }),
      inDecks: row.type === 'deck' ? [] : await containersHolding(ctx, row._id, DECK_CARD),
      inBundles: TOKEN_TYPES.has(row.type) ? await containersHolding(ctx, row._id, BUNDLE_TOKEN) : [],
      linkingRulesets: await rulesetsSlotting(ctx, row._id),
      assetPublishing: isPublicationAssetType(row.type) ? await publicationStatusFor(ctx, row.type, row._id) : null,
      backPublishing: await backFacePublication(ctx, row),
      resolvedBack: await resolveBackHref(ctx, row, presets),
    };
  },
});

/** The live asset at one address; a soft-deleted asset keeps its slug reserved and reads as absent. */
export async function liveAsset(ctx: QueryCtx, type: string, slug: string) {
  const holders = await ctx.db
    .query('assets')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .take(50);
  return holders.find((candidate) => candidate.type === type && !candidate.is_deleted) ?? null;
}

/**
 * Slugs are unique per Asset type (see CONTEXT.md): the slug's job is URL identity and URLs are `/assets/{type}/{slug}`.
 * A slug once used stays reserved even by soft-deleted assets, the group/faction convention.
 */
/**
 * The publication of an asset's authored back, if it has one.
 *
 * Read from the **stored mode**, never from whether bytes exist.
 * Switching a back from authored to referenced leaves its `.back` object in R2, which «Token multi-face publication model» accepted because publications are replaced and never deleted, so a page that asked R2 would keep offering a stale back forever.
 */
async function backFacePublication(ctx: QueryCtx, row: Doc<'assets'>) {
  if (!isPublicationAssetType(row.type)) {
    return null;
  }
  if (!(PUBLICATION_TARGETS[row.type].faces ?? []).includes('back')) {
    return null;
  }
  const back = (row.data as { back?: { mode?: unknown } } | null | undefined)?.back;
  if (back?.mode !== 'custom') {
    return null;
  }
  return await publicationStatusFor(ctx, row.type, publicationFaceId(row._id, 'back'));
}

/** Bounds the reverse slot read. A single asset appearing in more rulesets than this is a curation accident rather than a page to paginate. */
const LINKING_RULESET_LIMIT = 100;

/**
 * Which rulesets slot this asset, the mirror of `listRulesetAssetSlots`.
 *
 * The first read of `by_asset`, which the table has carried unused since it landed.
 * A soft-deleted ruleset has to be fetched before it can be skipped, so the bound sits on the index read rather than on the surviving count;
 * the slot row itself survives, the same bargain every other relation read here makes.
 */
async function rulesetsSlotting(ctx: QueryCtx, assetId: Id<'assets'>) {
  const rows = await ctx.db
    .query('ruleset_asset_slots')
    .withIndex('by_asset', (q) => q.eq('asset_id', assetId))
    .take(LINKING_RULESET_LIMIT);

  const entries = [];
  for (const row of rows) {
    const ruleset = await ctx.db.get('rulesets', row.ruleset_id);
    if (ruleset && !ruleset.is_deleted) {
      entries.push({ id: ruleset._id, slug: ruleset.slug, name: ruleset.name, slot: row.slot });
    }
  }
  return entries;
}

/** Exact lookup avoids reading assets of other types that share a slug. */
async function assetSlugHolder(ctx: QueryCtx, type: string, slug: string): Promise<Doc<'assets'> | null> {
  return await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', type).eq('slug', slug))
    .first();
}

/** Retained for older deployed editors that check name conflicts before saving. */
export const slugTaken = publicQuery({
  args: { type: v.string(), slug: v.string() },
  returns: v.union(v.literal('live'), v.literal('deleted'), v.null()),
  handler: async (ctx, args) => {
    const holder = await assetSlugHolder(ctx, args.type, args.slug);
    if (!holder) {
      return null;
    }
    return holder.is_deleted ? 'deleted' : 'live';
  },
});

/** Indexed claims and cursor advances share the asset's write transaction. */
async function allocateAssetSlug(ctx: MutationCtx, type: string, base: string, own?: Doc<'assets'>): Promise<string> {
  if (!base) {
    throw new ConvexError('An asset name is required; it determines the asset URL');
  }
  /* Preserve its existing address even when the unsuffixed address has become free. */
  if (own && slugify(nameOf(own)) === base) {
    return own.slug;
  }
  return await allocateCounterSlug(ctx, `asset-slug:${JSON.stringify([type, base])}`, base, async (slug) => {
    if (slug === 'create') {
      return false;
    }
    const holder = await assetSlugHolder(ctx, type, slug);
    return !holder || holder._id === own?._id;
  });
}

/**
 * Save-path validation of an asset's back, the one gate every writer of it shares («The stored shape of three back modes»: one field, one writer, one rule).
 *
 * A token reference may arrive without its target: a tab opened before the draft-based pick shipped submits only the mode.
 * The stored id is preserved rather than demanded back from the client, falling through to the legacy relation row for rows the migration has not reached.
 * Named tolerance, kept one release by ruling on the back-tiles ticket;
 * it and the legacy fallthrough retire together on the release after this slice ships.
 * A reference with no target anywhere stays a dangling reference, which resolves to the front rather than to an error, the lazy rule «Which tokens are referenceable» set.
 */
async function withValidatedBack(
  ctx: MutationCtx,
  row: { _id?: Id<'assets'>; type: string; data?: unknown },
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (TOKEN_TYPES.has(row.type)) {
    const back = tokenBackOf(data);
    if (back?.mode !== 'reference') {
      return data;
    }
    const stored = typeof back.asset_id === 'string' ? back.asset_id : null;
    const previous = row.data ? tokenBackOf(row.data) : null;
    const carried = typeof previous?.asset_id === 'string' ? previous.asset_id : null;
    const legacy = row._id ? await legacyRelationBackId(ctx, row._id) : null;
    const targetId = (stored ?? carried ?? legacy) as Id<'assets'> | null;
    if (!stored && targetId) {
      /* No shipped editor produces a mode-only reference any more, so each merge is a straggler tab worth counting before the tolerance retires. */
      console.warn(`token back tolerance: mode-only reference merged for asset ${row._id ?? '(create)'}`);
    }
    if (!targetId) {
      return data;
    }
    await assertReferenceableTokenBack(ctx, { _id: row._id ?? null, type: row.type }, targetId);
    return { ...data, back: { mode: 'reference', asset_id: targetId } };
  }
  if (row.type === 'deck') {
    const cardback = deckCardbackOf(data);
    if (cardback && cardback.mode === 'reference' && typeof cardback.asset_id === 'string') {
      await assertReferenceableDeckCardback(
        ctx,
        { _id: row._id ?? null, type: row.type },
        cardback.asset_id as Id<'assets'>
      );
    }
    return data;
  }
  return data;
}

/* A linked Nexus face snapshots the faction artwork through the ordinary asset writer. */
async function withNexusFaction(ctx: MutationCtx, type: string, input: unknown, previous?: unknown) {
  if (type !== 'card-nexus') {
    return input;
  }
  const card = parseNexusCardInput(input);
  if (!card.factionLink) {
    if (previous && parseNexusCardInput(previous).factionLink) {
      throw new ConvexError('Choose a faction before saving this Nexus card');
    }
    return card;
  }
  const id = ctx.db.normalizeId('factions', card.factionLink.id);
  const row = id ? await ctx.db.get('factions', id) : null;
  if (!row || row.is_deleted) {
    throw new ConvexError('Choose an available faction for this Nexus card');
  }
  const faction = parseStoredFactionForRead(row.data);
  return {
    ...card,
    factionLink: { id: row._id, slug: row.slug },
    faction: faction.name,
    factionSymbol: { image: faction.logo, background: faction.background },
    icon: [faction.background, faction.logo],
  };
}

/* The public writer and the GF9 import share validation, slug allocation and publication. */
async function createOwnedAsset(ctx: MutationCtx, userId: Id<'users'>, type: string, data: unknown) {
  assertKnownAssetType(type);
  const parsed = parseAssetDataForWrite(type, await withNexusFaction(ctx, type, data));
  parsed.data = await withValidatedBack(ctx, { type }, parsed.data as Record<string, unknown>);
  if (type === 'card-custom' || type === 'card-storm') {
    await validateCustomCardTokens(ctx, parsed.data);
  }
  const slug = await allocateAssetSlug(ctx, type, slugify(parsed.name));
  const now = nowIso();
  const id = await ctx.db.insert('assets', {
    owner_id: userId,
    type,
    data: parsed.data,
    slug,
    created_at: now,
    updated_at: now,
    is_deleted: false,
    group_id: null,
  });
  if (type === 'card-custom' || type === 'card-storm') {
    await syncCustomCardTokenRelations(ctx, id, parsed.data);
  }
  await enqueueAssetPublication(ctx, { _id: id, type, slug, data: parsed.data });
  return { id, slug };
}

export const create = mutation({
  args: { type: v.string(), data: v.any() },
  returns: v.object({ id: v.id('assets'), slug: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    if (args.type === 'card-nexus' && !parseNexusCardInput(args.data).factionLink) {
      throw new ConvexError('Choose a faction before creating this Nexus card');
    }
    return await createOwnedAsset(ctx, userId, args.type, args.data);
  },
});

export const update = mutation({
  args: { id: v.id('assets'), data: v.any() },
  returns: v.object({ id: v.id('assets'), slug: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get('assets', args.id);
    if (!row || row.is_deleted) {
      throw new Error(`Asset with id ${args.id} not found`);
    }
    /* The type is immutable: the stored row decides which schema the incoming data must satisfy. */
    const parsed = parseAssetDataForWrite(row.type, await withNexusFaction(ctx, row.type, args.data, row.data));
    parsed.data = await withValidatedBack(ctx, row, parsed.data as Record<string, unknown>);
    await requireAssetUpdate(ctx, args.id, parsed.name);
    if (row.type === 'card-custom' || row.type === 'card-storm') {
      await validateCustomCardTokens(ctx, parsed.data, row.data);
    }
    const slug =
      parsed.name === nameOf(row) ? row.slug : await allocateAssetSlug(ctx, row.type, slugify(parsed.name), row);
    await ctx.db.patch(args.id, { data: parsed.data, slug, updated_at: nowIso() });
    if (row.type === 'card-custom' || row.type === 'card-storm') {
      await syncCustomCardTokenRelations(ctx, args.id, parsed.data);
    }
    await enqueueAssetPublication(ctx, { _id: args.id, type: row.type, slug, data: parsed.data });
    if (TOKEN_TYPES.has(row.type)) {
      await ctx.scheduler.runAfter(0, internal.assets.refreshEmbeddedCards, { tokenId: args.id, cursor: null });
    }
    return { id: args.id, slug };
  },
});

/** Only an active administrator can change a treachery card's asset type. */
async function canConvertTreachery(ctx: QueryCtx, type: string): Promise<boolean> {
  if (type !== 'card-treachery') {
    return false;
  }
  const viewerId = await optionalActiveUserId(ctx);
  return viewerId ? (await ctx.db.get('users', viewerId))?.isAdmin === true : false;
}

/** Converts one card in place; ownership, deck references and completed publications retain their identity. */
export const convertTreacheryToCustom = mutation({
  args: { id: v.id('assets') },
  returns: v.object({ id: v.id('assets'), slug: v.string() }),
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const row = await ctx.db.get('assets', args.id);
    if (!row || row.is_deleted || row.type !== 'card-treachery') {
      throw new ConvexError('Only a live treachery card can be converted.');
    }
    let data;
    try {
      data = treacheryToCustomCard(row.data);
    } catch {
      throw new ConvexError(
        'This card cannot fit into custom-card layers. Check its artwork and text before converting.'
      );
    }
    const slug = await allocateAssetSlug(ctx, 'card-custom', row.slug);
    await ctx.db.patch(row._id, { type: 'card-custom', data, slug, updated_at: nowIso() });
    await supersedePendingPublication(ctx, 'card-treachery', row._id);
    await enqueueAssetPublication(ctx, { ...row, type: 'card-custom', data, slug });
    return { id: row._id, slug };
  },
});

/**
 * Retires an Asset without removing it: `is_deleted` is the only column that moves.
 * Every read filters on it, the slug stays reserved by `allocateAssetSlug`, and `asset_relations` rows are deliberately left alone.
 * A deleted card stops appearing in the decks that reference it (decision on the assets map: Deck→card reference mechanism and deletion semantics).
 * Idempotent, the faction convention: deleting twice is not an error.
 */
export const softDelete = mutation({
  args: { id: v.id('assets') },
  handler: async (ctx, args) => {
    const access = await requireAssetSoftDelete(ctx, args.id);

    await ctx.db.patch(access.subject._id, {
      is_deleted: true,
      updated_at: nowIso(),
    });
    if (TOKEN_TYPES.has(access.subject.type)) {
      await ctx.scheduler.runAfter(0, internal.assets.refreshEmbeddedCards, { tokenId: args.id, cursor: null });
    }
  },
});

/**
 * Hands an Asset to a Group, or takes it back.
 * Owner-only through `changeGroup`, and the target Group must be one the viewer could add a member to, so nobody can park an asset in a Group they do not help run.
 * This is what makes «Asset access reuses Group-associated-asset semantics» reachable: without it `group_id` stays null and collaborative editing never happens.
 */
export const setGroup = mutation({
  args: { id: v.id('assets'), group_id: v.union(v.id('groups'), v.null()) },
  handler: async (ctx, args) => {
    const access = await requireGroupReassignment(ctx, { kind: 'asset', id: args.id }, args.group_id);

    await ctx.db.patch(access.subject._id, {
      group_id: args.group_id,
      updated_at: nowIso(),
    });
  },
});

/** The relation kinds this file writes. Both live in one table, distinguished only by this string. */
const DECK_CARD = 'deck-card';
const BUNDLE_TOKEN = 'bundle-token';

/** Which kind a container's membership rows carry, and therefore what it is allowed to hold. */
export const CONTAINER_KINDS: Record<string, { kind: string; holds: (type: string) => boolean; noun: string }> = {
  deck: { kind: DECK_CARD, holds: (type) => type.startsWith('card-'), noun: 'cards' },
  bundle: { kind: BUNDLE_TOKEN, holds: (type) => TOKEN_TYPES.has(type), noun: 'tokens' },
};

/** Token Asset types, from the module every back rule shares. */
const TOKEN_TYPES = TOKEN_ASSET_TYPES;

/**
 * The token a given token uses as its backside, or null.
 * Reads the reference from `data.back`, falling through to the legacy `token-back` relation row until
 * `assets_back_modes_v1` has rewritten every row.
 * Filters a soft-deleted target at read time rather than cascading on delete, the rule «Deck→card reference mechanism and deletion semantics» set for every kind in this table.
 */
export async function tokenBackFor(ctx: QueryCtx, assetId: Id<'assets'>, data: unknown) {
  const back = tokenBackOf(data);
  const targetId =
    back?.mode === 'reference' && typeof back.asset_id === 'string'
      ? (back.asset_id as Id<'assets'>)
      : back?.mode === 'reference'
        ? ((await legacyRelationBackId(ctx, assetId)) as Id<'assets'> | null)
        : null;
  if (!targetId) {
    return null;
  }
  const target = await ctx.db.get('assets', targetId);
  return target && !target.is_deleted ? target : null;
}

/**
 * The deck a reference cardback points at, when the target still qualifies;
 * the deck sibling of `tokenBackFor`.
 * Qualification is `authoredDeckCardback`, the same judgement the browse presentation and the resolver apply, so the page cannot call a deck referenced that a tile would call dangling.
 * No legacy fallthrough: deck references never had a relation-row era.
 */
export async function referencedCardbackDeck(ctx: QueryCtx, row: Doc<'assets'>) {
  if (row.type !== 'deck') {
    return null;
  }
  const cardback = deckCardbackOf(row.data);
  if (!cardback || cardback.mode !== 'reference' || typeof cardback.asset_id !== 'string') {
    return null;
  }
  const target = await ctx.db.get('assets', cardback.asset_id as Id<'assets'>);
  return target && authoredDeckCardback(target) ? target : null;
}

/**
 * How many of one member a container holds.
 * Zero removes it.
 *
 * One mutation for every container kind, because "three copies" and "no copies" are the same statement about the same row whether the container is a deck or a bundle.
 * Which types may sit on either end is a rule of this mutation rather than of the schema, exactly as «Deck→card reference mechanism and deletion semantics» decided when it chose one table over per-kind tables: a deck holds cards, a bundle holds tokens, and neither holds the other.
 *
 * `count` means the same thing for both, a number of indistinguishable members.
 * A deck reads it as copies and a bundle reads it as physical supply, but that is wording in the editors rather than a difference in the column, so the vocabulary deliberately does not fork here.
 */
export const setMemberCount = mutation({
  args: { container_id: v.id('assets'), member_id: v.id('assets'), count: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.count) || args.count < 0 || args.count > 99) {
      throw new ConvexError('A member count must be a whole number between 0 and 99');
    }
    const container = await ctx.db.get('assets', args.container_id);
    if (!container || container.is_deleted) {
      throw new Error(`Asset with id ${args.container_id} not found`);
    }
    const rules = CONTAINER_KINDS[container.type];
    if (!rules) {
      throw new Error(`Asset type ${container.type} holds nothing`);
    }
    /* Membership changes touch no name, so the rename gate has nothing to compare. */
    await requireAssetUpdate(ctx, args.container_id);

    const member = await ctx.db.get('assets', args.member_id);
    if (!member || member.is_deleted) {
      throw new Error(`Asset with id ${args.member_id} not found`);
    }
    if (!rules.holds(member.type)) {
      throw new Error(`A ${container.type} holds ${rules.noun}, not ${member.type}`);
    }

    const existing = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_to_kind', (q) =>
        q.eq('from_asset_id', args.container_id).eq('to_asset_id', args.member_id).eq('kind', rules.kind)
      )
      .unique();
    if (args.count === 0) {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
    } else if (existing) {
      await ctx.db.patch(existing._id, { count: args.count });
    } else {
      await ctx.db.insert('asset_relations', {
        from_asset_id: args.container_id,
        to_asset_id: args.member_id,
        kind: rules.kind,
        count: args.count,
      });
    }
    await ctx.db.patch(args.container_id, { updated_at: nowIso() });
  },
});

/** Bounds a deck's composition read; a deck far below this is the ordinary case. */
const DECK_CARD_LIMIT = 500;

/**
 * A container's member rows with their counts, soft-deleted members filtered out at read time.
 * The asset page and Play's capture read the same members and project them differently.
 * Editor-scoped: the bulk, many-decks-at-once read the detail and browse pages want is «Build the relation read paths for the asset detail page», which this deliberately does not pre-empt.
 */
export async function membersOf(ctx: QueryCtx, containerId: Id<'assets'>, kind: string) {
  const relations = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', containerId).eq('kind', kind))
    .take(DECK_CARD_LIMIT + 1);
  const truncated = relations.length > DECK_CARD_LIMIT;
  const page = truncated ? relations.slice(0, DECK_CARD_LIMIT) : relations;
  const entries = [];
  for (const relation of page) {
    const member = await ctx.db.get('assets', relation.to_asset_id);
    if (member && !member.is_deleted) {
      entries.push({ row: member, count: relation.count });
    }
  }
  return { entries, truncated };
}

const DECKS_PER_CARD_LIMIT = 100;

/**
 * A deck as a card's membership line cites it.
 * Enough to name it and build its `/assets/{type}/{slug}` link, and deliberately not enough to draw its face, which would mean carrying `data` for every deck on the page.
 */
/**
 * Which containers of one kind hold one asset.
 * Shared by the page bundle and the bulk reader below so "a container that is soft-deleted stops being reported while its relation row survives" is decided once.
 *
 * Generalised over `kind` rather than copied per container, the same call `setMemberCount` made: a deck holding a card and a bundle holding a token are one query with one literal changed.
 */
async function containersHolding(
  ctx: QueryCtx,
  assetId: Id<'assets'>,
  kind: string,
  decks?: Map<Id<'assets'>, Doc<'assets'> | null>,
  limit = DECKS_PER_CARD_LIMIT
): Promise<DeckReference[]> {
  const seen = decks ?? new Map<Id<'assets'>, Doc<'assets'> | null>();
  const relations = await ctx.db
    .query('asset_relations')
    .withIndex('by_to_kind', (q) => q.eq('to_asset_id', assetId).eq('kind', kind))
    .take(limit);

  const entries: DeckReference[] = [];
  for (const relation of relations) {
    const containerId = relation.from_asset_id;
    if (!seen.has(containerId)) {
      seen.set(containerId, await ctx.db.get('assets', containerId));
    }
    const container = seen.get(containerId);
    if (container && !container.is_deleted) {
      entries.push({
        id: container._id,
        type: container.type,
        slug: container.slug,
        name: nameOf(container),
        count: relation.count,
      });
    }
  }
  return entries;
}

/**
 * Enough of a container's member to draw its face, and nothing more.
 *
 * Deliberately not `assetListEntryValidator`: that shape carries an owner, which costs a `profiles` read per member, and a browse page of two hundred bundles would pay six hundred of them for a name no tile shows.
 */
const memberPreviewValidator = v.object({
  id: v.id('assets'),
  type: v.string(),
  name: v.string(),
  data: v.any(),
  previewHref: v.union(v.string(), v.null()),
});

/** How many members a tile draws above its container. «What a bundle looks like» chose three. */
const MEMBER_PREVIEW_LIMIT = 3;

/**
 * How far into a container's relations this looks to find those three.
 * A soft-deleted member has to be read before it can be skipped, so a container whose first members were deleted would otherwise draw two faces, or none, with nothing on the tile able to explain why.
 * The bound sits on the index read, while the row reads still stop at three, which is where the cost actually is.
 */
const MEMBER_PREVIEW_SCAN = 12;

/**
 * The first few members of one container, in relation order, soft-deleted members skipped.
 * The bulk forward read «Build the relation read paths for the asset detail page» left to whoever needed it first.
 */
async function memberPreviews(ctx: QueryCtx, containerId: Id<'assets'>, kind: string) {
  const relations = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', containerId).eq('kind', kind))
    .take(MEMBER_PREVIEW_SCAN);

  const previews: Infer<typeof memberPreviewValidator>[] = [];
  for (const relation of relations) {
    if (previews.length === MEMBER_PREVIEW_LIMIT) {
      break;
    }
    const member = await ctx.db.get('assets', relation.to_asset_id);
    if (member && !member.is_deleted) {
      previews.push({
        id: member._id,
        type: member.type,
        name: nameOf(member),
        data: member.data,
        previewHref: isPublicationAssetType(member.type)
          ? publishedHref(member.type, member._id, member.updated_at)
          : null,
      });
    }
  }
  return previews;
}

/**
 * One tile on the browse grid: a listing entry plus the member previews a bundle's band draws.
 * Derived here rather than added to `assetListEntryValidator`, because the landing page draws piles of every type and would pay a relation pass per row for a fact it never shows.
 */
const assetBrowseEntryValidator = assetListEntryValidator.extend({
  members: v.array(memberPreviewValidator),
});

/**
 * How many rows one browse page holds.
 * Tied to `PER_TYPE_LIMIT` rather than restated, since the two answer the same question about the same table.
 */
const BROWSE_LIMIT = PER_TYPE_LIMIT;

/**
 * Whether a tile on this type's browse page draws the members standing behind it.
 *
 * Only bundles, and the relation kind comes off `CONTAINER_KINDS` rather than being restated here.
 * A deck is a container too and is deliberately absent: it wears a Cardback, so it already has a face of its own, while a bundle's band is all it has, which is why «What a bundle looks like» put members above it.
 * Every other type skips the relation pass entirely rather than reading `asset_relations` once per row to learn it holds nothing.
 */
function memberPreviewKind(type: string): string | null {
  return type === 'bundle' ? (CONTAINER_KINDS[type]?.kind ?? null) : null;
}

/**
 * Everything `/assets/{type}` draws, in one read.
 *
 * The route holds one page query (see docs/technical/ui-design-decisions.md), and `listByTypes` cannot become that query because `AssetPicker` shares it and would inherit a per-row index scan it has no use for.
 * Search and the sorts run on the client against this bounded set: `name` lives inside an untyped blob and `updated_at` has no index, so moving one of them server-side would fork the subscription to buy consistency in a single case.
 *
 * `truncated` exists so a full page says so rather than quietly under-reporting its own total.
 */
export const browsePage = publicQuery({
  args: { type: v.string() },
  returns: v.object({
    entries: v.array(assetBrowseEntryValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('assets')
      .withIndex('by_type_deleted', (q) => q.eq('type', args.type).eq('is_deleted', false))
      .order('desc')
      .take(BROWSE_LIMIT + 1);
    const truncated = rows.length > BROWSE_LIMIT;
    const page = truncated ? rows.slice(0, BROWSE_LIMIT) : rows;

    const previewKind = memberPreviewKind(args.type);
    /* One deck backs many of the cards on a page, and one owner holds many of the assets, so each row is read once and reused across the whole grid. */
    const decks = new Map<Id<'assets'>, Doc<'assets'> | null>();
    const owners = new Map<Id<'users'>, Awaited<ReturnType<typeof profileSummary>>>();
    const presets: CardbackPresetMemo = new Map();
    const entries: Infer<typeof assetBrowseEntryValidator>[] = [];
    for (const row of page) {
      /* No cache across rows here, unlike `decks`: two bundles sharing a token is the exception, where a deck shared across a page of cards is the rule. */
      const members = previewKind ? await memberPreviews(ctx, row._id, previewKind) : [];
      entries.push({
        ...(await toListEntry(ctx, row, { owners, presets }, { deckBacks: decks })),
        members,
      });
    }

    return { entries, truncated };
  },
});

/** Refreshes linked cards in bounded batches; token saves never traverse an entire reverse index. */
export const refreshEmbeddedCards = internalMutation({
  args: { tokenId: v.id('assets'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('asset_relations')
      .withIndex('by_to_kind', (q) => q.eq('to_asset_id', args.tokenId).eq('kind', CUSTOM_CARD_TOKEN_RELATION))
      .paginate({ cursor: args.cursor, numItems: 20 });
    for (const relation of page.page) {
      await ctx.scheduler.runAfter(0, internal.assets.refreshEmbeddedCard, {
        tokenId: args.tokenId,
        cardId: relation.from_asset_id,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.assets.refreshEmbeddedCards, {
        tokenId: args.tokenId,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

/** Each dependent card refreshes in its own transaction, so a failed card cannot stop the others. */
export const refreshEmbeddedCard = internalMutation({
  args: { tokenId: v.id('assets'), cardId: v.id('assets') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const card = await ctx.db.get('assets', args.cardId);
    if (
      card &&
      !card.is_deleted &&
      (card.type === 'card-custom' || card.type === 'card-storm') &&
      customCardTokenIds(card.data).includes(args.tokenId)
    ) {
      await ctx.db.patch(card._id, { updated_at: nowIso() });
      await enqueueAssetPublication(ctx, card);
    }
    return null;
  },
});

/** The create page's live token resolution, held only while its draft embeds tokens. */
export const customCardTokens = publicQuery({
  args: { ids: v.array(v.id('assets')) },
  returns: zodToConvex(CustomCardTokenResolution),
  handler: async (ctx, args) => await resolveCustomCardTokens(ctx, args.ids),
});

/**
 * One deck or token bundle as a summary line cites it: its name, how many pieces it holds and one face to show for it.
 * A deck shows its Cardback, a bundle its first token, with that token's type so the caller cuts it to its shape.
 * Shared with the create page's ruleset preview, which lists what a ruleset puts on the table.
 */
export async function containerSummary(ctx: QueryCtx, row: Doc<'assets'>) {
  const kind = CONTAINER_KINDS[row.type]?.kind;
  if (!kind) {
    return null;
  }
  /* Counted from the relation rows alone, so a summary costs one index range however large the container: a deleted member still counts until it is unlinked. */
  const relations = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', row._id).eq('kind', kind))
    .take(DECK_CARD_LIMIT + 1);
  const truncated = relations.length > DECK_CARD_LIMIT;
  const counted = truncated ? relations.slice(0, DECK_CARD_LIMIT) : relations;
  const count = counted.reduce((total, relation) => total + relation.count, 0);
  if (row.type === 'deck') {
    const appearance = await presentedAppearance(ctx, row, new Map(), new Map());
    return { name: nameOf(row), count, truncated, face: appearance.href, faceType: 'deck' };
  }
  const first = await firstLiveMember(ctx, counted);
  return {
    name: nameOf(row),
    count,
    truncated,
    face: first && isPublicationAssetType(first.type) ? publishedHref(first.type, first._id, first.updated_at) : null,
    faceType: first?.type ?? 'token-disc',
  };
}

const FACE_SCAN_LIMIT = 5;

/* The first member that is not deleted, from a few relations at most, to show as a bundle's face. */
async function firstLiveMember(ctx: QueryCtx, relations: Doc<'asset_relations'>[]) {
  for (const relation of relations.slice(0, FACE_SCAN_LIMIT)) {
    const member = await ctx.db.get('assets', relation.to_asset_id);
    if (member && !member.is_deleted) {
      return member;
    }
  }
  return null;
}

async function ensureImportedAsset(ctx: MutationCtx, ownerId: Id<'users'>, type: string, data: { name: string }) {
  const slug = slugify(data.name);
  const existing = await assetSlugHolder(ctx, type, slug);
  if (!existing) {
    return await createOwnedAsset(ctx, ownerId, type, data);
  }
  if (existing.owner_id !== ownerId || existing.is_deleted || nameOf(existing) !== data.name) {
    throw new Error(`The ${type}/${slug} address is already reserved`);
  }
  return { id: existing._id, slug: existing.slug };
}

async function ensureImportedDeckCard(ctx: MutationCtx, deckId: Id<'assets'>, cardId: Id<'assets'>) {
  const member = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_to_kind', (q) => q.eq('from_asset_id', deckId).eq('to_asset_id', cardId).eq('kind', DECK_CARD))
    .unique();
  if (member) {
    return;
  }
  await ctx.db.insert('asset_relations', {
    from_asset_id: deckId,
    to_asset_id: cardId,
    kind: DECK_CARD,
    count: 1,
  });
}

/* An operator imports the printed deck once for an explicitly selected active owner.
 * A repeat keeps authored content and existing counts intact.
 * Name collisions stop the transaction rather than adopting someone else's asset.
 */
export const seedGf9NexusDeck = internalMutation({
  args: { ownerId: v.id('users') },
  returns: v.object({ deckId: v.id('assets'), slug: v.string(), cardIds: v.array(v.id('assets')) }),
  handler: async (ctx, { ownerId }) => {
    const owner = await ctx.db.get(ownerId);
    if (!owner || (owner.account_state ?? 'active') !== 'active') {
      throw new Error('The Nexus deck needs an active owner');
    }
    const deck = await ensureImportedAsset(ctx, ownerId, 'deck', GF9_NEXUS_DECK);
    const cardIds = await Promise.all(
      GF9_NEXUS_CARDS.map(async (card) => {
        const created = await ensureImportedAsset(ctx, ownerId, 'card-nexus', card);
        await ensureImportedDeckCard(ctx, deck.id, created.id);
        return created.id;
      })
    );
    return { deckId: deck.id, slug: deck.slug, cardIds };
  },
});

/* The original import marker and untouched timestamp keep later authoring out of this correction. */
async function correctImportedNexusAsset(
  ctx: MutationCtx,
  row: Doc<'assets'>,
  replacement: unknown,
  originalAbout: string
): Promise<'updated' | 'unchanged' | 'preserved'> {
  const data = parseAssetDataForWrite(row.type, replacement).data;
  const current = parseAssetDataForWrite(row.type, row.data).data;
  if (JSON.stringify(current) === JSON.stringify(data)) {
    return 'unchanged';
  }
  if (row.updated_at !== row.created_at || row.data.about !== originalAbout) {
    return 'preserved';
  }
  await ctx.db.patch(row._id, { data, updated_at: nowIso() });
  await enqueueAssetPublication(ctx, { ...row, data });
  return 'updated';
}

/* Corrects the supplied GF9 deck in place after release, preserving custom edits and every reference. */
export const correctGf9NexusDeck = internalMutation({
  args: { ownerId: v.id('users') },
  returns: v.object({
    deckId: v.id('assets'),
    deckUpdated: v.boolean(),
    deckPreserved: v.boolean(),
    updated: v.array(v.id('assets')),
    unchanged: v.array(v.id('assets')),
    preserved: v.array(v.string()),
  }),
  handler: async (ctx, { ownerId }) => {
    const [owner, deck] = await Promise.all([
      ctx.db.get('users', ownerId),
      assetSlugHolder(ctx, 'deck', 'gf9-nexus-deck'),
    ]);
    if (!owner || (owner.account_state ?? 'active') !== 'active') {
      throw new ConvexError('The Nexus deck needs an active owner');
    }
    if (!deck || deck.is_deleted || deck.owner_id !== ownerId) {
      throw new ConvexError('The selected owner must own GF9 Nexus Deck');
    }
    const members = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deck._id).eq('kind', DECK_CARD))
      .take(13);
    const memberIds = new Set(members.map((member) => member.to_asset_id));
    if (members.length !== 12 || memberIds.size !== 12) {
      throw new ConvexError('GF9 Nexus Deck must still contain its twelve cards');
    }
    const results = await Promise.all(
      members.map(async (member) => {
        const row = await ctx.db.get('assets', member.to_asset_id);
        if (!row || row.is_deleted || row.type !== 'card-nexus' || row.owner_id !== ownerId) {
          throw new ConvexError('The Nexus card no longer belongs to this deck');
        }
        const card = GF9_NEXUS_CARDS.find((stock) => slugify(stock.name) === row.slug);
        if (!card) {
          const name = typeof row.data.name === 'string' ? row.data.name : row.slug;
          return { id: row._id, name, status: 'preserved' as const };
        }
        const status = await correctImportedNexusAsset(
          ctx,
          row,
          card,
          'GF9 Ecaz & Moritani Nexus card. Rules paraphrased from the printed card. Reference: https://boardgamegeek.com/image/7767032/dune-ecaz-and-moritani'
        );
        return { id: row._id, name: card.name, status };
      })
    );
    const deckStatus = await correctImportedNexusAsset(
      ctx,
      deck,
      GF9_NEXUS_DECK,
      "The twelve Nexus cards from GF9's Ecaz & Moritani expansion, one of each faction. Rules follow the printed deck. Card artwork is recreated for Dune Zone."
    );
    return {
      deckId: deck._id,
      deckUpdated: deckStatus === 'updated',
      deckPreserved: deckStatus === 'preserved',
      updated: results.filter((result) => result.status === 'updated').map((result) => result.id),
      unchanged: results.filter((result) => result.status === 'unchanged').map((result) => result.id),
      preserved: results.filter((result) => result.status === 'preserved').map((result) => result.name),
    };
  },
});

async function preservedStandardStormDeck(ctx: MutationCtx, existing: Doc<'assets'>, ownerId: Id<'users'>) {
  if (existing.owner_id !== ownerId || existing.is_deleted) {
    throw new ConvexError('The Standard Storm Deck address is already reserved');
  }
  const members = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', existing._id).eq('kind', 'deck-card'))
    .take(7);
  const cards = await Promise.all(members.map((member) => ctx.db.get('assets', member.to_asset_id)));
  const sectors = new Set(
    cards.map((card) =>
      card?.type === 'card-storm' && !card.is_deleted ? StormCardAssetInput.parse(card.data).sectors : null
    )
  );
  if (members.length !== 6 || members.some((member) => member.count !== 1) || sectors.size !== 6 || sectors.has(null)) {
    throw new ConvexError(
      'The existing Standard Storm Deck has changed. Review its contents before provisioning again.'
    );
  }
  return { deckId: existing._id, cardIds: members.map((member) => member.to_asset_id), created: false };
}

/** Creates the requested standard catalogue once; a rerun preserves authored cards and deck contents. */
export const provisionStandardStormDeck = internalMutation({
  args: { ownerId: v.id('users') },
  returns: v.object({ deckId: v.id('assets'), cardIds: v.array(v.id('assets')), created: v.boolean() }),
  handler: async (ctx, { ownerId }) => {
    const owner = await ctx.db.get('users', ownerId);
    if (!owner || (owner.account_state !== undefined && owner.account_state !== 'active')) {
      throw new ConvexError('Choose an active owner for the standard storm deck');
    }
    const existing = await assetSlugHolder(ctx, 'deck', 'standard-storm-deck');
    if (existing) {
      return await preservedStandardStormDeck(ctx, existing, ownerId);
    }
    const now = nowIso();
    const cardIds: Id<'assets'>[] = [];
    for (const card of STANDARD_STORM_CARDS) {
      const data = StormCardAssetInput.parse(card);
      const slug = slugify(data.name);
      if (await assetSlugHolder(ctx, 'card-storm', slug)) {
        throw new ConvexError(`The storm card address ${slug} is already reserved`);
      }
      const id = await ctx.db.insert('assets', {
        owner_id: ownerId,
        type: 'card-storm',
        data,
        slug,
        created_at: now,
        updated_at: now,
        is_deleted: false,
        group_id: null,
      });
      cardIds.push(id);
      await enqueueAssetPublication(ctx, { _id: id, type: 'card-storm', slug, data });
    }
    const data = DeckAssetInput.parse({
      name: 'Standard Storm Deck',
      about: 'Six storm cards, numbered 1 through 6, with one copy of each.',
      cardback: { mode: 'preset', key: 'storm' },
    });
    const deckId = await ctx.db.insert('assets', {
      owner_id: ownerId,
      type: 'deck',
      data,
      slug: 'standard-storm-deck',
      created_at: now,
      updated_at: now,
      is_deleted: false,
      group_id: null,
    });
    for (const cardId of cardIds) {
      await ctx.db.insert('asset_relations', {
        from_asset_id: deckId,
        to_asset_id: cardId,
        kind: 'deck-card',
        count: 1,
      });
    }
    await enqueueAssetPublication(ctx, { _id: deckId, type: 'deck', slug: 'standard-storm-deck', data });
    return { deckId, cardIds, created: true };
  },
});

/** Replaces reviewed standard designs only while all six cards and the shared back still match the review. */
export const replaceStandardStormDesigns = internalMutation({
  args: {
    ownerId: v.id('users'),
    expectedCards: v.array(v.object({ id: v.id('assets'), data: v.any() })),
    expectedBackRevision: v.number(),
  },
  returns: v.array(v.id('assets')),
  handler: async (ctx, { ownerId, expectedCards, expectedBackRevision }) => {
    const deck = await assetSlugHolder(ctx, 'deck', 'standard-storm-deck');
    if (!deck) {
      throw new ConvexError('The Standard Storm Deck does not exist');
    }
    const back = DeckAssetInput.parse(deck.data).cardback;
    if (!('mode' in back) || back.mode !== 'preset' || back.key !== 'storm') {
      throw new ConvexError('The Standard Storm Deck no longer uses the shared Storm back');
    }
    const { cardIds } = await preservedStandardStormDeck(ctx, deck, ownerId);
    if (
      expectedCards.length !== 6 ||
      new Set(expectedCards.map((card) => card.id)).size !== 6 ||
      expectedCards.some((card) => !cardIds.includes(card.id))
    ) {
      throw new ConvexError('Review all six Standard Storm Deck cards before replacing their designs');
    }
    for (const expected of expectedCards) {
      const row = await ctx.db.get('assets', expected.id);
      if (
        !row ||
        row.owner_id !== ownerId ||
        JSON.stringify(StormCardAssetInput.parse(row.data)) !== JSON.stringify(StormCardAssetInput.parse(expected.data))
      ) {
        throw new ConvexError('A Storm card changed after review. Review the saved designs again.');
      }
      const reviewed = StormCardAssetInput.parse(row.data);
      const data = StormCardAssetInput.parse({
        ...STANDARD_STORM_CARDS[reviewed.sectors - 1],
        name: reviewed.name,
        about: reviewed.about,
      });
      await ctx.db.patch(row._id, { data, updated_at: nowIso() });
      await syncCustomCardTokenRelations(ctx, row._id, data);
      await enqueueAssetPublication(ctx, { ...row, data });
    }
    await storeCardbackPreset(ctx, 'storm', STANDARD_STORM_CARDBACK, expectedBackRevision);
    return cardIds;
  },
});

/** Creates the requested reference deck once, preserving later edits when called again. */
export const seedGf9StrongholdDeck = internalMutation({
  args: { ownerProfileSlug: v.string() },
  returns: v.object({ deckId: v.id('assets'), slug: v.string(), created: v.boolean() }),
  handler: async (ctx, { ownerProfileSlug }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_slug', (q) => q.eq('slug', ownerProfileSlug))
      .unique();
    if (profile?.account_state !== 'active' || profile.merged_into_profile_id) {
      throw new Error('The deck needs an active owner profile');
    }
    const deckSlug = slugify(GF9_STRONGHOLD_DECK.name);
    const existing = await ctx.db
      .query('assets')
      .withIndex('by_type_and_slug', (q) => q.eq('type', 'deck').eq('slug', deckSlug))
      .unique();
    if (existing) {
      if (existing.is_deleted || existing.owner_id !== profile.user_id) {
        throw new Error('The GF9 Stronghold Deck address is already reserved');
      }
      return { deckId: existing._id, slug: existing.slug, created: false };
    }
    const now = nowIso();
    const insert = async (type: string, data: unknown) => {
      const parsed = parseAssetDataForWrite(type, data);
      const slug = await allocateAssetSlug(ctx, type, slugify(parsed.name));
      const id = await ctx.db.insert('assets', {
        owner_id: profile.user_id,
        type,
        data: parsed.data,
        slug,
        created_at: now,
        updated_at: now,
        is_deleted: false,
        group_id: null,
      });
      await enqueueAssetPublication(ctx, { _id: id, type, data: parsed.data, slug });
      return { id, slug };
    };
    const deck = await insert('deck', GF9_STRONGHOLD_DECK);
    for (const card of GF9_STRONGHOLD_CARDS) {
      const member = await insert(
        'card-stronghold',
        card
      ); /* NOSONAR: slug allocation and trigger-aware writes stay sequential. */
      await ctx.db.insert('asset_relations', {
        /* NOSONAR: each relation follows its inserted card. */
        from_asset_id: deck.id,
        to_asset_id: member.id,
        kind: 'deck-card',
        count: 1,
      });
    }
    return { deckId: deck.id, slug: deck.slug, created: true };
  },
});

/** Preserves authored fields and changes only the original stock artwork treatment. */
function polishedStrongholdData(data: (typeof GF9_STRONGHOLD_CARDS)[number]) {
  const original = GF9_STRONGHOLD_CARDS.find((stock) => {
    const id = stock.decals[0]!.id;
    const legacyId = id.replace('/image/decal/gf9-', '/vector/decal/').replace('.png', '-multicolor.svg');
    return data.decals[0]?.id === id || data.decals[0]?.id === legacyId;
  });
  if (!original) {
    return data;
  }
  const name =
    original.name === 'HMS stronghold' && data.name === 'Ixian Hidden Mobile Stronghold' ? original.name : data.name;
  const legacyId = original.decals[0]!.id.replace('/image/decal/gf9-', '/vector/decal/').replace(
    '.png',
    '-multicolor.svg'
  );
  const decals = data.decals.map((decal) =>
    decal.id === legacyId &&
    !decal.muted &&
    decal.outline === false &&
    decal.scale === 1.65 /* NOSONAR: only the exact stored stock value identifies the untouched seed. */ &&
    decal.offset.every((value) => value === 0)
      ? { ...decal, id: original.decals[0]!.id, scale: original.decals[0]!.scale }
      : decal
  );
  const about =
    data.about ===
    'GF9 CHOAM & Richese advanced stronghold card. The Body summarizes the printed ability. The Decals are an original interpretation of its location.'
      ? original.about
      : data.about;
  if (name === data.name && about === data.about && decals.every((decal, index) => decal === data.decals[index])) {
    return data;
  }
  return { ...data, name, about, decals };
}

/** Allocates the corrected title before writing and publishing that same card. */
async function publishPolishedStronghold(ctx: MutationCtx, card: Doc<'assets'>, now: string) {
  const data = StrongholdCardAsset.parse(card.data);
  const next = polishedStrongholdData(data);
  if (next === data) {
    return 0;
  }
  const slug = next.name === data.name ? card.slug : await allocateAssetSlug(ctx, card.type, slugify(next.name), card);
  await ctx.db.patch(card._id, {
    data: next,
    slug,
    updated_at: now,
  });
  await enqueueAssetPublication(ctx, {
    ...card,
    data: next,
    slug,
  });
  return 1;
}

/** Corrects the original stock layout in place while retaining later authored content. */
export const polishGf9StrongholdDeck = internalMutation({
  args: { ownerProfileSlug: v.string() },
  returns: v.object({ deckId: v.id('assets'), cardsChanged: v.number(), deckChanged: v.boolean() }),
  handler: async (ctx, { ownerProfileSlug }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_slug', (q) => q.eq('slug', ownerProfileSlug))
      .unique();
    const deck = await ctx.db
      .query('assets')
      .withIndex('by_type_and_slug', (q) => q.eq('type', 'deck').eq('slug', 'gf9-stronghold-deck'))
      .unique();
    if (
      profile?.account_state !== 'active' ||
      profile.merged_into_profile_id ||
      !deck ||
      deck.is_deleted ||
      deck.owner_id !== profile.user_id
    ) {
      throw new Error('The correction needs the active GF9 Stronghold Deck owner');
    }
    const relations = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deck._id).eq('kind', 'deck-card'))
      .take(7);
    const cards = await Promise.all(relations.map((relation) => ctx.db.get('assets', relation.to_asset_id)));
    if (
      relations.length !== 6 ||
      relations.some((relation) => relation.kind !== 'deck-card' || relation.count !== 1) ||
      cards.some(
        (card) => !card || card.is_deleted || card.type !== 'card-stronghold' || card.owner_id !== profile.user_id
      )
    ) {
      throw new Error('The correction needs the six original stronghold cards');
    }
    const now = nowIso();
    let cardsChanged = 0;
    for (const card of cards) {
      if (!card) {
        continue;
      }
      cardsChanged += await publishPolishedStronghold(ctx, card, now); /* NOSONAR: sequential slug writes. */
    }
    const data = DeckAssetInput.parse(deck.data);
    const back = data.cardback;
    const deckChanged =
      'mode' in back &&
      back.mode === 'custom' &&
      back.image === '/vector/icon/stronghold.svg' &&
      back.imageScale === 0.55; /* NOSONAR: the exact stored stock value identifies the untouched seed. */
    if (deckChanged && 'mode' in back && back.mode === 'custom') {
      const next = {
        ...data,
        cardback: {
          ...back,
          image: GF9_STRONGHOLD_DECK.cardback.image,
          imageScale: GF9_STRONGHOLD_DECK.cardback.imageScale,
        },
      };
      await ctx.db.patch(deck._id, { data: next, updated_at: now });
      await enqueueAssetPublication(ctx, { ...deck, data: next });
    }
    return { deckId: deck._id, cardsChanged, deckChanged };
  },
});

/** Corrects the untouched first GF9 printing without replacing authored or transferred cards. */
export const refreshGF9LeaderSkillPresentationV2 = internalMutation({
  args: {},
  returns: v.array(v.id('assets')),
  handler: async (ctx) => {
    const installed = await ctx.db
      .query('leader_skill_stock_sets')
      .withIndex('by_key', (q) => q.eq('key', 'gf9-leader-skills'))
      .unique();
    if (!installed) {
      return [];
    }
    if (installed.card_ids.length !== GF9_LEADER_SKILLS.length) {
      throw new ConvexError('The GF9 stock set has an unexpected card count.');
    }
    const updated = await Promise.all(
      installed.card_ids.map(async (id, index) => {
        const asset = await ctx.db.get('assets', id);
        if (
          !asset ||
          asset.is_deleted ||
          asset.owner_id !== installed.owner_id ||
          asset.type !== 'card-leaderability'
        ) {
          return null;
        }
        const card = GF9_LEADER_SKILLS[index]!;
        const legacy = LeaderSkillAssetInput.parse({
          ...card,
          icon: [card.icon[0], '/vector/generic/star.svg'],
          textSize: 32,
          decals: card.decals.map((decal) => ({
            ...decal,
            id: card.name === 'Smuggler' ? '/vector/decal/smuggler-multicolor.svg' : decal.id,
          })),
        });
        const current = LeaderSkillAssetInput.safeParse(asset.data);
        if (!current.success || JSON.stringify(current.data) !== JSON.stringify(legacy)) {
          return null;
        }
        const data = LeaderSkillAssetInput.parse(card);
        await ctx.db.patch('assets', id, { data, updated_at: nowIso() });
        await enqueueAssetPublication(ctx, { ...asset, data });
        return id;
      })
    );
    return updated.filter((id) => id !== null);
  },
});

/** Installs the GF9 stock set once, preserving later edits and refusing occupied addresses. */
export const seedGF9LeaderSkills = internalMutation({
  args: { ownerId: v.id('users') },
  returns: v.object({ deckId: v.id('assets'), cardIds: v.array(v.id('assets')), created: v.number() }),
  handler: async (ctx, { ownerId }) => {
    const owner = await ctx.db.get('users', ownerId);
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', ownerId))
      .unique();
    if (!owner?.isAdmin || owner.merged_into_user_id || (profile && profile.account_state !== 'active')) {
      throw new ConvexError('The stock deck needs an active administrator as its owner.');
    }
    const installed = await ctx.db
      .query('leader_skill_stock_sets')
      .withIndex('by_key', (q) => q.eq('key', 'gf9-leader-skills'))
      .unique();
    if (installed) {
      if (installed.owner_id !== ownerId) {
        throw new ConvexError('The GF9 stock set already belongs to another administrator.');
      }
      const assets = await Promise.all(
        [installed.deck_id, ...installed.card_ids].map((id) => ctx.db.get('assets', id))
      );
      if (assets.some((asset) => !asset || asset.is_deleted || asset.owner_id !== ownerId)) {
        throw new ConvexError('An installed GF9 stock asset was deleted or transferred.');
      }
      return { deckId: installed.deck_id, cardIds: installed.card_ids, created: 0 };
    }
    async function install(type: string, data: unknown) {
      const parsed = parseAssetDataForWrite(type, data);
      const slug = slugify(parsed.name);
      const existing = await ctx.db
        .query('assets')
        .withIndex('by_type_and_slug', (q) => q.eq('type', type).eq('slug', slug))
        .unique();
      if (existing) {
        throw new ConvexError(`The stock address ${type}/${slug} is already reserved.`);
      }
      const now = nowIso();
      const id = await ctx.db.insert('assets', {
        owner_id: ownerId,
        type,
        slug,
        data: parsed.data,
        created_at: now,
        updated_at: now,
        is_deleted: false,
        group_id: null,
      });
      await enqueueAssetPublication(ctx, { _id: id, type, slug, data: parsed.data });
      return id;
    }
    const cardIds = await Promise.all(GF9_LEADER_SKILLS.map((card) => install('card-leaderability', card)));
    const deckId = await install('deck', GF9_LEADER_SKILL_DECK);
    /* Both ends are newly inserted in this transaction, so no relation can already exist. */
    await Promise.all(
      cardIds.map((cardId) =>
        ctx.db.insert('asset_relations', {
          from_asset_id: deckId,
          to_asset_id: cardId,
          kind: 'deck-card',
          count: 1,
        })
      )
    );
    await ctx.db.insert('leader_skill_stock_sets', {
      key: 'gf9-leader-skills',
      owner_id: ownerId,
      deck_id: deckId,
      card_ids: cardIds,
    });
    return { deckId, cardIds, created: cardIds.length + 1 };
  },
});
