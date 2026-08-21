import type { Infer } from 'convex/values';
import { v } from 'convex/values';

import {
  isPublicationAssetType,
  PUBLICATION_TARGETS,
  publicationFaceId,
} from '../src/shared/asset-publishing/publicationTargets';
import { holdsDeckMembership } from '../src/shared/assets/types';
import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { publicationStatusFor } from './assetPublishingStatus';
import { mutation } from './functions';
import {
  assertReferenceableDeckCardback,
  assertReferenceableTokenBack,
  authoredDeckCardback,
  deckCardbackOf,
  legacyRelationBackId,
  resolveBackHref,
  supersedePendingBackJob,
  TOKEN_ASSET_TYPES,
  tokenBackOf,
} from './lib/assetBacks';
import { assetDisplayName, assertKnownAssetType, parseAssetDataForWrite } from './lib/assetInput';
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
import { requireAuthUserId } from './lib/policy';
import { profileSummary } from './lib/profileSummary';
import { enqueueAssetPublication } from './lib/publication';
import { nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

/**
 * Listing entry for catalogue surfaces.
 * `data` passes through untyped — per-type Zod schemas live with the editors, and listing renderers parse defensively — while `name` is lifted server-side so every surface agrees on the fallback.
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

async function toListEntry(
  ctx: QueryCtx,
  row: Doc<'assets'>,
  /* One owner holds many assets on a page, so a caller reading hundreds of rows passes a memo and pays per owner rather than per row. */
  owners?: Map<Id<'users'>, Awaited<ReturnType<typeof profileSummary>>>,
  presentation?: DeckBackPresentation
) {
  if (owners && !owners.has(row.owner_id)) {
    owners.set(row.owner_id, await profileSummary(ctx, row.owner_id));
  }
  return {
    id: row._id,
    type: row.type,
    slug: row.slug,
    name: nameOf(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner: owners ? owners.get(row.owner_id)! : await profileSummary(ctx, row.owner_id),
    data: presentation ? await presentedData(ctx, row, presentation.deckBacks) : row.data,
  };
}

/**
 * What a listing hands the client as `data`, distinct from the stored truth the page query returns.
 *
 * A reference-mode deck has no composition of its own, so the target's authored cardback resolves in here («How browse surfaces get a referenced deck's cardback»): one memoized point read, depth one always since only authored cardbacks are referenceable, and tiles, piles and pickers render exactly what they rendered before.
 * A dangling reference presents `cardback: null`, the marker recorded on that ticket: no other path produces it, and the face renderer treats it as a neutral face until the tile presentation lands.
 * Every other row passes through untouched.
 */
async function presentedData(ctx: QueryCtx, row: Doc<'assets'>, deckBacks: Map<Id<'assets'>, Doc<'assets'> | null>) {
  if (row.type !== 'deck') {
    return row.data;
  }
  const cardback = deckCardbackOf(row.data);
  if (!cardback || !('mode' in cardback)) {
    return row.data;
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
  return { ...(row.data as Record<string, unknown>), cardback: target ? authoredDeckCardback(target) : null };
}

/** Bounds every catalogue read; ordinary use sits far below it. */
const CATALOGUE_SCAN_LIMIT = 1000;
const RECENT_LIMIT = 24;
const PER_TYPE_LIMIT = 200;

/** The `/assets` landing: newest assets across every type, plus per-type counts. */
export const cataloguePage = query({
  args: {},
  returns: v.object({
    recent: v.array(assetListEntryValidator),
    countsByType: v.record(v.string(), v.number()),
    /* The counts tally a bounded window, so a full window says so rather than quietly under-reporting, the same honesty `browsePage.truncated` already keeps. */
    countsTruncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('assets')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .order('desc')
      .take(CATALOGUE_SCAN_LIMIT);

    const countsByType: Record<string, number> = {};
    for (const row of rows) {
      countsByType[row.type] = (countsByType[row.type] ?? 0) + 1;
    }

    /* Sequential like the other list readers, so the memo fills before the rows that would hit it. */
    const deckBacks = new Map<Id<'assets'>, Doc<'assets'> | null>();
    const recent = [];
    for (const row of rows.slice(0, RECENT_LIMIT)) {
      recent.push(await toListEntry(ctx, row, undefined, { deckBacks }));
    }
    return { recent, countsByType, countsTruncated: rows.length === CATALOGUE_SCAN_LIMIT };
  },
});

/** A category browse page: the caller names the flat Asset types its category derives to. */
export const listByTypes = query({
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
    const entries = [];
    for (const row of rows) {
      entries.push(await toListEntry(ctx, row, owners, { deckBacks }));
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

export const getPage = query({
  args: { type: v.string(), slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      asset: assetListEntryValidator,
      viewerAccess: assetViewerAccessValidator,
      assignableGroups: v.array(assignedGroupSummaryValidator),
      /** The token serving as this one's backside, for the types that have one. Null covers both "custom back" and "none". */
      backToken: v.union(assetListEntryValidator, v.null()),
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
      /** Null for a type that publishes nothing, which today is every type but `card-treachery`. */
      assetPublishing: v.union(assetPublishingValidator, v.null()),
      /**
       * The authored back's own publication, which is a second artifact under a face-qualified id rather than a second field on the first.
       * Null when the type has no second face, or when the back is a reference and therefore publishes nothing of its own.
       * A sidecar rather than a widening of `assetPublishingValidator`, because that validator is shared with the faction and ruleset pages, which have exactly one publication each and gain nothing from learning about faces.
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
    const holders = await ctx.db
      .query('assets')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .take(50);
    const row = holders.find((candidate) => candidate.type === args.type && !candidate.is_deleted);
    if (!row) {
      return null;
    }
    const access = await loadAssetAccessBundle(ctx, { kind: 'asset', row });
    const back = TOKEN_TYPES.has(row.type) ? await tokenBackFor(ctx, row._id, row.data) : null;
    return {
      asset: await toListEntry(ctx, row),
      viewerAccess: access.viewerAccess,
      assignableGroups: access.assignableGroups,
      backToken: back ? await toListEntry(ctx, back) : null,
      ...(CONTAINER_KINDS[row.type]
        ? await membersOf(ctx, row._id, CONTAINER_KINDS[row.type]!.kind).then((m) => ({
            members: m.entries,
            membersTruncated: m.truncated,
          }))
        : { members: [], membersTruncated: false }),
      inDecks: row.type === 'deck' ? [] : await containersHolding(ctx, row._id, DECK_CARD),
      inBundles: TOKEN_TYPES.has(row.type) ? await containersHolding(ctx, row._id, BUNDLE_TOKEN) : [],
      linkingRulesets: await rulesetsSlotting(ctx, row._id),
      assetPublishing: isPublicationAssetType(row.type) ? await publicationStatusFor(ctx, row.type, row._id) : null,
      backPublishing: await backFacePublication(ctx, row),
      resolvedBack: await resolveBackHref(ctx, row),
    };
  },
});

/**
 * Slugs are unique per Asset type (see CONTEXT.md) — the slug's job is URL identity and URLs are `/assets/{type}/{slug}` — and a slug once used stays reserved even by soft-deleted assets, the group/faction convention.
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

async function assertAssetSlugAvailable(ctx: MutationCtx, type: string, slug: string) {
  const holders = await ctx.db
    .query('assets')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .take(50);
  if (holders.some((row) => row.type === type)) {
    throw new Error(`Asset slug ${slug} is reserved for this asset type`);
  }
}

/**
 * Save-path validation of an asset's back, the one gate every writer of it shares («The stored shape of three back modes»: one field, one writer, one rule).
 *
 * A token reference may arrive without its target, because today's editors still pick through `setTokenBack` and the draft only carries the mode.
 * The stored id is preserved rather than demanded back from the client, falling through to the legacy relation row for rows the migration has not reached.
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
    if (!targetId) {
      return data;
    }
    await assertReferenceableTokenBack(ctx, { _id: row._id ?? null, type: row.type }, targetId);
    return { ...data, back: { mode: 'reference', asset_id: targetId } };
  }
  if (row.type === 'deck') {
    const cardback = deckCardbackOf(data);
    if (cardback && 'mode' in cardback && typeof cardback.asset_id === 'string') {
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

export const create = mutation({
  args: { type: v.string(), data: v.any() },
  returns: v.object({ id: v.id('assets'), slug: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    assertKnownAssetType(args.type);
    const parsed = parseAssetDataForWrite(args.type, args.data);
    parsed.data = await withValidatedBack(ctx, { type: args.type }, parsed.data as Record<string, unknown>);
    const slug = slugify(parsed.name);
    if (!slug) {
      throw new Error('An asset name is required; it determines the asset URL');
    }
    await assertAssetSlugAvailable(ctx, args.type, slug);
    const now = nowIso();
    const id = await ctx.db.insert('assets', {
      owner_id: userId,
      type: args.type,
      data: parsed.data,
      slug,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      group_id: null,
    });
    await enqueueAssetPublication(ctx, { _id: id, type: args.type, slug, data: parsed.data });
    return { id, slug };
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
    const parsed = parseAssetDataForWrite(row.type, args.data);
    parsed.data = await withValidatedBack(ctx, row, parsed.data as Record<string, unknown>);
    await requireAssetUpdate(ctx, args.id, parsed.name);
    const slug = slugify(parsed.name);
    if (!slug) {
      throw new Error('An asset name is required; it determines the asset URL');
    }
    if (slug !== row.slug) {
      await assertAssetSlugAvailable(ctx, row.type, slug);
    }
    await ctx.db.patch(args.id, { data: parsed.data, slug, updated_at: nowIso() });
    await enqueueAssetPublication(ctx, { _id: args.id, type: row.type, slug, data: parsed.data });
    return { id: args.id, slug };
  },
});

/**
 * Retires an Asset without removing it: `is_deleted` is the only column that moves.
 * Every read filters on it, the slug stays reserved by `assertAssetSlugAvailable`, and `asset_relations` rows are deliberately left alone.
 * A deleted card simply stops appearing in the decks that reference it (decision on the assets map: Deck→card reference mechanism and deletion semantics).
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

/** The relation kinds this file writes. All three live in one table, distinguished only by this string. */
const TOKEN_BACK = 'token-back';
const DECK_CARD = 'deck-card';
const BUNDLE_TOKEN = 'bundle-token';

/** Which kind a container's membership rows carry, and therefore what it is allowed to hold. */
const CONTAINER_KINDS: Record<string, { kind: string; holds: (type: string) => boolean; noun: string }> = {
  deck: { kind: DECK_CARD, holds: (type) => type.startsWith('card-'), noun: 'cards' },
  bundle: { kind: BUNDLE_TOKEN, holds: (type) => TOKEN_TYPES.has(type), noun: 'tokens' },
};

/** Token Asset types, from the module every back rule shares. */
const TOKEN_TYPES = TOKEN_ASSET_TYPES;

/**
 * Points a token's backside at another token.
 *
 * Transitional: the reference now lives in `data.back` («The stored shape of three back modes»), and this mutation survives one release only because today's editors pick through it.
 * It routes through the same validator as the save path, writes the same field, and clears any legacy `token-back` relation row it finds;
 * the draft-based pick that retires it lands with the editor slice.
 *
 * Clearing moved to the save path with the mode union, so `null` is refused rather than half-supported;
 * no caller has ever sent it.
 */
export const setTokenBack = mutation({
  args: { id: v.id('assets'), back_asset_id: v.union(v.id('assets'), v.null()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get('assets', args.id);
    if (!row || row.is_deleted) {
      throw new Error(`Asset with id ${args.id} not found`);
    }
    if (!TOKEN_TYPES.has(row.type)) {
      throw new Error(`Asset type ${row.type} has no backside`);
    }
    await requireAssetUpdate(ctx, args.id, nameOf(row));
    if (args.back_asset_id === null) {
      throw new Error('Clearing a backside happens by saving another back mode');
    }
    await assertReferenceableTokenBack(ctx, row, args.back_asset_id);

    const existing = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_kind', (q) => q.eq('from_asset_id', args.id).eq('kind', TOKEN_BACK))
      .take(10);
    for (const relation of existing) {
      await ctx.db.delete(relation._id);
    }
    const data = row.data as Record<string, unknown>;
    await ctx.db.patch(args.id, {
      data: { ...data, back: { mode: 'reference', asset_id: args.back_asset_id } },
      updated_at: nowIso(),
    });
    /* Leaving an authored back supersedes its pending publication, the same rule the save path applies. */
    await supersedePendingBackJob(ctx, row.type, args.id);
  },
});

/**
 * The token a given token uses as its backside, or null.
 * Reads the reference from `data.back`, falling through to the legacy `token-back` relation row until
 * `assets_back_modes_v1` has rewritten every row.
 * Filters a soft-deleted target at read time rather than cascading on delete, the rule «Deck→card reference mechanism and deletion semantics» set for every kind in this table.
 */
async function tokenBackFor(ctx: QueryCtx, assetId: Id<'assets'>, data: unknown) {
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
      throw new Error('A member count must be a whole number between 0 and 99');
    }
    const container = await ctx.db.get('assets', args.container_id);
    if (!container || container.is_deleted) {
      throw new Error(`Asset with id ${args.container_id} not found`);
    }
    const rules = CONTAINER_KINDS[container.type];
    if (!rules) {
      throw new Error(`Asset type ${container.type} holds nothing`);
    }
    await requireAssetUpdate(ctx, args.container_id, nameOf(container));

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
 * A deck's cards with their counts, soft-deleted members filtered out at read time.
 * Editor-scoped: the bulk, many-decks-at-once read the detail and browse pages want is «Build the relation read paths for the asset detail page», which this deliberately does not pre-empt.
 */
async function membersOf(ctx: QueryCtx, containerId: Id<'assets'>, kind: string) {
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
      entries.push({ member: await toListEntry(ctx, member), count: relation.count });
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
      previews.push({ id: member._id, type: member.type, name: nameOf(member), data: member.data });
    }
  }
  return previews;
}

/**
 * One tile on the browse grid: a listing entry plus the two derived facts it draws.
 * Derived here rather than added to `assetListEntryValidator`, because the landing page draws piles of every type and would pay an index scan per row for facts it never shows.
 */
const assetBrowseEntryValidator = assetListEntryValidator.extend({
  deckCount: v.number(),
  /* True when the count hit its browse-page ceiling, so a tile says "25+ decks" rather than lying at the cap. */
  deckCountCapped: v.boolean(),
  members: v.array(memberPreviewValidator),
});

/*
 * The browse read is a product: rows times relations times container rows, and Convex allows 16,384
 * documents per function. Two hundred rows at the detail page's ceiling of one hundred is 20,000
 * before a single profile, so a mature page would throw rather than degrade. Twenty-five holds the
 * worst case near 10,000 with the memoisation, and the tile reports the cap honestly.
 */
const BROWSE_DECKS_PER_CARD = 25;

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
 * Search, the four sorts and the membership facet all run on the client against this bounded set: three of the four sorts cannot be an index anyway, since `name` lives inside an untyped blob, `owner` lives in another table and `deckCount` is derived, so moving one of them server-side would fork the subscription to buy consistency in a single case.
 *
 * `truncated` exists so a full page says so rather than quietly under-reporting its own total.
 * `inNoDeckCount` is null, not zero, for a type nothing can hold, because "no orphans" and "the question does not apply" are different answers and the facet is hidden for the second.
 */
export const browsePage = query({
  args: { type: v.string() },
  returns: v.object({
    entries: v.array(assetBrowseEntryValidator),
    inNoDeckCount: v.union(v.number(), v.null()),
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

    const counted = holdsDeckMembership(args.type);
    const previewKind = memberPreviewKind(args.type);
    /* One deck holds many of the cards on a page, and one owner holds many of the assets, so each row is read once and reused across the whole grid. */
    const decks = new Map<Id<'assets'>, Doc<'assets'> | null>();
    const owners = new Map<Id<'users'>, Awaited<ReturnType<typeof profileSummary>>>();
    const entries: Infer<typeof assetBrowseEntryValidator>[] = [];
    let inNoDeckCount = 0;
    for (const row of page) {
      const holders = counted ? await containersHolding(ctx, row._id, DECK_CARD, decks, BROWSE_DECKS_PER_CARD + 1) : [];
      const deckCountCapped = holders.length > BROWSE_DECKS_PER_CARD;
      const deckCount = deckCountCapped ? BROWSE_DECKS_PER_CARD : holders.length;
      if (counted && deckCount === 0) {
        inNoDeckCount += 1;
      }
      /* No cache across rows here, unlike `decks`: two bundles sharing a token is the exception, where a deck shared across a page of cards is the rule. */
      const members = previewKind ? await memberPreviews(ctx, row._id, previewKind) : [];
      entries.push({
        ...(await toListEntry(ctx, row, owners, { deckBacks: decks })),
        deckCount,
        deckCountCapped,
        members,
      });
    }

    return { entries, inNoDeckCount: counted ? inNoDeckCount : null, truncated };
  },
});
