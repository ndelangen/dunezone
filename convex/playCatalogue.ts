import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { factionTroopPublicationId } from '../src/shared/asset-publishing/factionTroopPublication';
import type { PublicationAssetType } from '../src/shared/asset-publishing/publicationTargets';
import {
  isPublicationAssetType,
  publicationFaceId,
  publishedHref,
} from '../src/shared/asset-publishing/publicationTargets';
import { holdsDeckMembership } from '../src/shared/assets/types';
import { CanonicalFactionStoredObject, toStoredHeroKey } from '../src/shared/factions/schema';
import { assetSupplySchema, factionDefinitionWireSchema, rulesetSupplySchema } from '../src/shared/play/capture';
import { isSpawnType, SPAWN_TYPES } from '../src/shared/play/captureTypes';
import type { SpawnType } from '../src/shared/play/captureTypes';
import { playDraftableFactionsSchema } from '../src/shared/play/drafting';
import { SPAWN_PICKER_STEP, spawnableAssetsSchema } from '../src/shared/play/inventory';
import type { SpawnableAsset } from '../src/shared/play/inventory';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { publicationHrefFor } from './assetPublishingStatus';
import {
  CONTAINER_KINDS,
  DECK_CARD,
  DECKS_PER_CARD_LIMIT,
  liveAsset,
  membersOf,
  referencedCardbackDeck,
  tokenBackFor,
} from './assets';
import { publicQuery } from './functions';
import { resolveBackHref, TOKEN_ASSET_TYPES } from './lib/assetBacks';
import { assetDisplayName } from './lib/assetInput';
import type { CardbackPresetMemo } from './lib/cardbackPresets';
import { catalogueSearchLimit, catalogueSearchReach, selectCatalogueSearch } from './lib/catalogueOrder';
import { profileSummaryReader } from './lib/profileSummary';
import { rulesetBoard } from './lib/rulesetBoard';
import { listRulesetAssetSlots } from './lib/rulesetSlots';

/*
 * What Play reads of the catalogue when a game captures it or drafts from it.
 * Every read is public and viewer-free: it projects rows and publications the catalogue already
 * exposes, and decides nothing about readiness.
 * The game contract (`src/shared/play/capture.ts` and `drafting.ts`) owns every answer shape and
 * the records built from them; the wire validators derive from it.
 */

/**
 * The current publication of one face, if any.
 * A pending or failed replacement leaves the existing publication in place, so a face with an older usable image still reads as published.
 */
async function publishedFace(ctx: QueryCtx, assetType: PublicationAssetType, assetId: string) {
  const publication = await ctx.db
    .query('publication_assets')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', assetType).eq('asset_id', assetId))
    .unique();
  return publication ? publishedHref(assetType, assetId, publication.cache_token) : null;
}

/**
 * The shared prediction card's front, the Treachery card an Administrator authored at this slug, or null when it is absent or unpublished (#1753).
 * Every faction's prediction is drawn over this one base until prediction cards get their own asset type.
 */
const PREDICTION_CARD = { type: 'card-treachery', slug: 'prediction' } as const;
async function predictionFront(ctx: QueryCtx) {
  const row = await liveAsset(ctx, PREDICTION_CARD.type, PREDICTION_CARD.slug);
  return row ? await publishedFace(ctx, PREDICTION_CARD.type, row._id) : null;
}

/** The slotted supply a game captures at creation. A soft-deleted or unknown ruleset reads as absent. */
export const rulesetSupply = publicQuery({
  args: { rulesetId: v.string() },
  returns: v.union(v.null(), zodToConvex(rulesetSupplySchema)),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('rulesets', args.rulesetId);
    const row = id ? await ctx.db.get('rulesets', id) : null;
    if (!row || row.is_deleted) {
      return null;
    }
    return {
      ruleset: { id: row._id, slug: row.slug, name: row.name },
      /* Older Workers accept only deck and bundle slots during the additive rollout. */
      slots: await listRulesetAssetSlots(ctx, row._id, { skipBoard: true }),
      board: await rulesetBoard(ctx, row._id),
    };
  },
});

/**
 * The stored definition a game captures at public assignment, with the faces its generated components have published.
 * A row that does not parse as a canonical faction reads with no definition;
 * the game contract decides what an absent or incomplete definition means.
 */
export const factionDefinition = publicQuery({
  args: { factionId: v.string() },
  returns: v.union(v.null(), zodToConvex(factionDefinitionWireSchema)),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('factions', args.factionId);
    const row = id ? await ctx.db.get('factions', id) : null;
    if (!row || row.is_deleted) {
      return null;
    }
    const parsed = CanonicalFactionStoredObject.safeParse(row.data);
    const leaders = [];
    for (const leader of parsed.success ? parsed.data.leaders : []) {
      leaders.push({
        memberId: leader.memberId,
        front: await publishedFace(ctx, 'faction-leader', factionMemberPublicationId(row._id, leader.memberId)),
      });
    }
    const troops = await Promise.all(
      (parsed.success ? parsed.data.troops : []).flatMap(({ troopId }) => {
        if (!troopId) {
          return [];
        }
        const id = factionTroopPublicationId(row._id, troopId);
        return [
          Promise.all([
            publishedFace(ctx, 'faction-troop', id),
            publishedFace(ctx, 'faction-troop', publicationFaceId(id, 'back')),
          ]).then(([front, back]) => ({ troopId, front, back })),
        ];
      })
    );
    const traitors = await Promise.all(
      (parsed.success ? parsed.data.leaders : []).map(async ({ memberId }) => ({
        memberId,
        front: await publishedFace(ctx, 'faction-traitor', factionMemberPublicationId(row._id, memberId)),
      }))
    );
    return {
      faction: { id: row._id, slug: row.slug, name: parsed.success ? parsed.data.name : '' },
      /* The glossary term is "Faction leader"; this answer keeps the `hero` literal so a game Worker one deploy behind still reads it. */
      data: parsed.success ? toStoredHeroKey(parsed.data) : null,
      token: await publishedFace(ctx, 'faction-token', row._id),
      tokenBack: await publishedFace(ctx, 'faction-token', publicationFaceId(row._id, 'back')),
      cardbacks: {
        traitor: await publishedFace(ctx, 'cardback-preset', 'traitor'),
        alliance: await publishedFace(ctx, 'cardback-preset', 'alliance'),
        prediction: await publishedFace(ctx, 'cardback-preset', 'prediction'),
      },
      leaders,
      troops,
      traitors,
      alliance: await publishedFace(ctx, 'faction-alliance', row._id),
      prediction: await predictionFront(ctx),
    };
  },
});

const DRAFTABLE_FACTION_LIMIT = 500;

/* The ruleset's own factions always make the list; the rest of it holds the newest live factions, in creation order. */
async function draftCandidates(ctx: QueryCtx, linked: ReadonlySet<Id<'factions'>>) {
  const rows = await Promise.all([...linked].map((id) => ctx.db.get(id)));
  const chosen = new Map(
    rows.filter((row): row is Doc<'factions'> => row !== null && !row.is_deleted).map((row) => [row._id, row])
  );
  const newest = ctx.db
    .query('factions')
    .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
    .order('desc');
  for await (const row of newest) {
    if (chosen.size >= DRAFTABLE_FACTION_LIMIT) {
      break;
    }
    chosen.set(row._id, row);
  }
  return [...chosen.values()].sort((a, b) => a._creationTime - b._creationTime);
}

/**
 * Every live faction as a drafting game reads it: its token's render data, its theme colour, whether it is linked to the game's ruleset and whether its token is published.
 * A row that does not parse is left out;
 * readiness beyond the token is judged by the capture at assignment.
 */
export const draftableFactions = publicQuery({
  args: { rulesetId: v.string() },
  returns: zodToConvex(playDraftableFactionsSchema),
  handler: async (ctx, args) => {
    const rulesetId = ctx.db.normalizeId('rulesets', args.rulesetId);
    const links = rulesetId
      ? await ctx.db
          .query('ruleset_factions')
          .withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', rulesetId))
          .take(500)
      : [];
    const linked = new Set(links.map((link) => link.faction_id));
    const rows = await draftCandidates(ctx, linked);
    const factions = [];
    for (const row of rows) {
      const parsed = CanonicalFactionStoredObject.safeParse(row.data);
      if (!parsed.success) {
        continue;
      }
      factions.push({
        id: row._id,
        slug: row.slug,
        name: parsed.data.name,
        logo: parsed.data.logo,
        background: parsed.data.background,
        color: parsed.data.themeColor,
        linked: linked.has(row._id),
        /* A game needs both faces of the reversible token, so a faction is draftable only once both are published. */
        published:
          (await publishedFace(ctx, 'faction-token', row._id)) !== null &&
          (await publishedFace(ctx, 'faction-token', publicationFaceId(row._id, 'back'))) !== null,
      });
    }
    return { factions };
  },
});

function supplyEntry(row: Doc<'assets'>) {
  return { id: row._id, type: row.type, slug: row.slug, name: assetDisplayName(row), data: row.data };
}

/** One asset's faces as the asset page resolves them, with the rows its back is authored on. */
async function suppliedAsset(ctx: QueryCtx, row: Doc<'assets'>, presets: CardbackPresetMemo) {
  const backToken = TOKEN_ASSET_TYPES.has(row.type) ? await tokenBackFor(ctx, row.data) : null;
  const backDeck = await referencedCardbackDeck(ctx, row);
  const back = await resolveBackHref(ctx, row, presets);
  return {
    asset: supplyEntry(row),
    front: isPublicationAssetType(row.type) ? await publicationHrefFor(ctx, row.type, row._id) : null,
    back: back?.href ?? null,
    backMode: back?.mode ?? null,
    backToken: backToken && supplyEntry(backToken),
    backDeck: backDeck && supplyEntry(backDeck),
  };
}

/**
 * The oldest live deck holding this card, or null when none of the first decks to hold it is live.
 * A card has no back of its own: at the table it wears the back of the deck it belongs to.
 */
async function holdingDeck(ctx: QueryCtx, card: Doc<'assets'>) {
  const relations = await ctx.db
    .query('asset_relations')
    .withIndex('by_to_kind', (q) => q.eq('to_asset_id', card._id).eq('kind', DECK_CARD))
    .take(DECKS_PER_CARD_LIMIT);
  for (const relation of relations) {
    const deck = await ctx.db.get('assets', relation.from_asset_id);
    if (deck && !deck.is_deleted && deck.type === 'deck') {
      return deck;
    }
  }
  return null;
}

/**
 * One card, token, deck or bundle as a game captures it, every member's faces included, in one read.
 * A single card answers with the back of its holding deck, and names that deck.
 * A soft-deleted or unknown asset reads as absent, and a soft-deleted member is left out, as the asset page leaves it out.
 */
export const assetSupply = publicQuery({
  args: { type: v.string(), slug: v.string() },
  returns: v.union(v.null(), zodToConvex(assetSupplySchema)),
  handler: async (ctx, args) => {
    const row = await liveAsset(ctx, args.type, args.slug);
    if (!row) {
      return null;
    }
    const presets: CardbackPresetMemo = new Map();
    const container = CONTAINER_KINDS[row.type];
    const { entries, truncated } = container
      ? await membersOf(ctx, row._id, container.kind)
      : { entries: [], truncated: false };
    const members = await Promise.all(
      entries.map(async ({ row: member, count }) => ({ ...(await suppliedAsset(ctx, member, presets)), count }))
    );
    const supplied = { ...(await suppliedAsset(ctx, row, presets)), members, membersTruncated: truncated };
    if (!holdsDeckMembership(row.type)) {
      return supplied;
    }
    const deck = await holdingDeck(ctx, row);
    const worn = deck && (await suppliedAsset(ctx, deck, presets));
    return worn
      ? { ...supplied, back: worn.back, backMode: worn.backMode, backDeck: worn.backDeck, cardDeck: worn.asset }
      : { ...supplied, cardDeck: null };
  },
});

/** The spawnable rows one picker read selected, newest or best first, and whether a larger limit would select more. */
type SpawnableSelection = { rows: Doc<'assets'>[]; hasMore: boolean; capped: boolean };

async function nextRow(rows: AsyncIterator<Doc<'assets'>>) {
  const next = await rows.next();
  return next.done ? undefined : next.value;
}

/**
 * The newest live assets of the spawnable types, newest first across the types.
 * Each type's index is walked from its newest row only as far as the merge needs, so the read is the limit plus one row per type, however many assets there are.
 */
async function newestSpawnables(
  ctx: QueryCtx,
  types: readonly SpawnType[],
  limit: number
): Promise<SpawnableSelection> {
  const lists = types.map((type) => ({
    rows: ctx.db
      .query('assets')
      .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
      .order('desc')
      [Symbol.asyncIterator](),
    head: undefined as Doc<'assets'> | undefined,
  }));
  await Promise.all(lists.map(async (list) => (list.head = await nextRow(list.rows))));
  const rows: Doc<'assets'>[] = [];
  /* One more than the limit says whether there are more. */
  while (rows.length <= limit) {
    const newest = lists.reduce<(typeof lists)[number] | undefined>(
      (best, list) => (list.head && (!best?.head || list.head._creationTime > best.head._creationTime) ? list : best),
      undefined
    );
    if (!newest?.head) {
      break;
    }
    rows.push(newest.head);
    newest.head = await nextRow(newest.rows);
  }
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit, capped: false };
}

/** The best matches of the asset catalogue's search among the spawnable types, each type's list taken in turn, read back to their live rows. */
async function searchedSpawnables(
  ctx: QueryCtx,
  types: readonly SpawnType[],
  text: string,
  limit: number
): Promise<SpawnableSelection> {
  const selection = await selectCatalogueSearch(ctx, {
    kind: 'asset',
    partition: types[0]!,
    partitions: [...types],
    text,
    limit,
  });
  const read = await Promise.all(
    selection.entries.map(async (entry) => {
      const assetId = ctx.db.normalizeId('assets', entry.source_id);
      return assetId ? await ctx.db.get('assets', assetId) : null;
    })
  );
  /* Drift leaves the list one row short until the backfill or the asset's next save, as the asset catalogue does. */
  const rows = read.filter((row): row is Doc<'assets'> => row !== null && !row.is_deleted);
  return { rows, hasMore: selection.hasMore, capped: selection.capped };
}

/** The rows as the picker lists them; one owner's profile is read once however many of the rows are theirs. */
async function spawnableEntries(ctx: QueryCtx, rows: Doc<'assets'>[]) {
  const ownerOf = profileSummaryReader(ctx);
  const entries: SpawnableAsset[] = [];
  for (const row of rows) {
    if (isSpawnType(row.type)) {
      const owner = await ownerOf(row.owner_id);
      entries.push({ type: row.type, slug: row.slug, name: assetDisplayName(row), owner: owner?.username ?? null });
    }
  }
  return entries;
}

/**
 * The decks, bundles and tokens a seated player may ask the table to spawn, as the in-play picker lists them: the newest first with no search, else the best matches of the asset catalogue's search over the asset's and its owner's names.
 * `limit` grows with Load more up to the catalogue search's ceiling, past which `capped` says to search instead.
 * Readiness is not judged here: the game captures the chosen asset and refuses one that is incomplete, as it did when the picker listed every asset.
 */
export const spawnableAssets = publicQuery({
  args: {
    /** Words of the asset's or its owner's name; empty or absent lists the newest. */
    q: v.optional(v.string()),
    /** How many rows to return; Load more asks again with a larger one. */
    limit: v.optional(v.number()),
    /** Only these types, as a shelf of the shared table inventory asks for its own; empty or absent lists every spawnable type. */
    types: v.optional(v.array(v.union(...SPAWN_TYPES.map((type) => v.literal(type))))),
  },
  returns: zodToConvex(spawnableAssetsSchema),
  handler: async (ctx, args) => {
    const limit = catalogueSearchLimit(args.limit, SPAWN_PICKER_STEP);
    const text = args.q?.trim() ?? '';
    const types = args.types?.length ? [...new Set(args.types)] : SPAWN_TYPES;
    const selection = text
      ? await searchedSpawnables(ctx, types, text, limit)
      : await newestSpawnables(ctx, types, limit);
    return {
      entries: await spawnableEntries(ctx, selection.rows),
      ...catalogueSearchReach(selection, limit, SPAWN_PICKER_STEP),
    };
  },
});
