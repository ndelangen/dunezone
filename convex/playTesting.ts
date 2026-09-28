import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import type { PublicationAssetType } from '../src/shared/asset-publishing/publicationTargets';
import { publishedR2Key, publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { PLAY_FIXTURE_KEY } from '../src/shared/play/admission';
import { loadProfileSchema } from '../src/shared/play/loadProfile';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { newestUnusedPlayRefresh, playCredential } from './lib/playAuthorization';
import { insertPendingGame } from './lib/playProvisioningSchedule';
import { limitLiveGames, requireSyntheticBackend } from './lib/playSynthetic';

function requireShortExpiry(expiresInMs: number) {
  const withinTestWindow = expiresInMs >= 0 && expiresInMs <= 30_000;
  if (!Number.isInteger(expiresInMs) || !withinTestWindow) {
    throw new Error('Test expiry must be within thirty seconds');
  }
}

async function syntheticExpiryTarget(ctx: MutationCtx, sessionId: Id<'authSessions'>, kind: 'total' | 'inactivity') {
  const session = await ctx.db.get(sessionId);
  if (!session) {
    throw new Error('Synthetic session not found');
  }
  await requireSyntheticUser(ctx, session.userId);
  if (kind === 'total') {
    return session;
  }
  const refresh = await newestUnusedPlayRefresh(ctx, sessionId);
  if (!refresh) {
    throw new Error('Synthetic refresh token not found');
  }
  return refresh;
}

function isLocalFixtureKey(key: string | undefined) {
  return key !== undefined && (key === PLAY_FIXTURE_KEY || /^synthetic-[a-f0-9]{64}$/.test(key));
}

async function requireSyntheticUser(ctx: MutationCtx, userId: Id<'users'>) {
  const user = await ctx.db.get(userId);
  if (!user?.email?.endsWith('@example.invalid')) {
    throw new Error('Play test controls only accept synthetic accounts');
  }
  return user;
}

/** Real Auth signs the account in; this control changes only the synthetic account's Administrator flag. */
export const setAdministrator = internalMutation({
  args: { userId: v.id('users'), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyntheticBackend();
    await requireSyntheticUser(ctx, args.userId);
    await ctx.db.patch(args.userId, { isAdmin: args.enabled });
    return null;
  },
});

/** Shrinks a real Auth lifetime for bounded expiry tests; it cannot create or renew a session. */
export const shortenSession = internalMutation({
  args: {
    sessionId: v.id('authSessions'),
    kind: v.union(v.literal('total'), v.literal('inactivity')),
    expiresInMs: v.number(),
  },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, args) => {
    requireSyntheticBackend();
    requireShortExpiry(args.expiresInMs);
    const target = await syntheticExpiryTarget(ctx, args.sessionId, args.kind);
    const expiresAt = Math.min(target.expirationTime, Date.now() + args.expiresInMs);
    await ctx.db.patch(target._id, { expirationTime: expiresAt });
    return { expiresAt };
  },
});

/** Test-only games have fresh DO IDs; a browser opens one at its own game address. */
export const createFixture = internalMutation({
  args: { loadProfile: v.optional(zodToConvex(loadProfileSchema)) },
  returns: v.object({ gameId: v.id('play_games'), secret: v.string(), attemptId: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    requireSyntheticBackend();
    await limitLiveGames(ctx);
    return await insertPendingGame(ctx, {
      fixture_key: `synthetic-${playCredential()}`,
      ...(args.loadProfile ? { load_profile: args.loadProfile } : {}),
    });
  },
});

/** Retains the old fixture and its game data while allowing a fresh local directory entry. */
export const retireFixture = internalMutation({
  args: { gameId: v.id('play_games') },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyntheticBackend();
    const game = await ctx.db.get(args.gameId);
    if (!game || !isLocalFixtureKey(game.fixture_key)) {
      throw new Error('Play test controls only retire a canonical or synthetic fixture');
    }
    if (game.state !== 'expired') {
      await ctx.db.patch(game._id, { state: 'expired' });
    }
    return null;
  },
});

const CATALOGUE_OWNER_EMAIL = 'catalogue@example.invalid';

/** The one synthetic account that owns every seeded catalogue row, so both seeds can run on one backend. */
async function catalogueOwner(ctx: MutationCtx) {
  const existing = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', CATALOGUE_OWNER_EMAIL))
    .first();
  return (
    existing?._id ?? (await ctx.db.insert('users', { name: 'Local catalogue fixture', email: CATALOGUE_OWNER_EMAIL }))
  );
}

const publicationValidator = v.object({ key: v.string(), href: v.string(), face: v.string() });

/** One face the runner installs local bytes for, and its publication row. */
async function publish(ctx: MutationCtx, assetType: PublicationAssetType, assetId: string, face: string) {
  await ctx.db.insert('publication_assets', {
    asset_type: assetType,
    asset_id: assetId,
    cache_token: 'local-fixture',
    published_at: Date.now(),
  });
  return { key: publishedR2Key(assetType, assetId), href: publishedHref(assetType, assetId, 'local-fixture'), face };
}

/*
 * Authored values the browser funding case needs: five troops cost five spice, three troops cost three.
 * The Harkonnen colour is a saturated red so the carry checks can find its troop tokens by their pixels.
 */
const SYNTHETIC_TROOP_COMBAT = { strength: 0.5, fundedStrength: 1, fundingCost: 1 };
const SYNTHETIC_FACTIONS = [
  { slug: 'synthetic-harkonnen', name: 'Harkonnen', color: '#b3261e' },
  { slug: 'synthetic-atreides', name: 'Atreides', color: '#75d8a7' },
];

/**
 * Seeds a ruleset an Administrator can start a real game with on the disposable browser backend: both required decks, and two linked factions with published tokens and authored troop combat values.
 * Returns the publications whose local bytes the runner installs.
 */
export const seedRealGameCatalogue = internalMutation({
  args: {},
  returns: v.object({ rulesetId: v.id('rulesets'), publications: v.array(publicationValidator) }),
  handler: async (ctx) => {
    requireSyntheticBackend();
    const owner = await catalogueOwner(ctx);
    const stamp = new Date().toISOString();
    const row = { owner_id: owner, created_at: stamp, updated_at: stamp, is_deleted: false, group_id: null };
    const publications = [];
    /* Slugs resolve a capture and a ruleset page, so each seed's rows stay distinct from an earlier seed's on the same backend. */
    const suffix = playCredential().slice(0, 8);
    const rulesetId = await ctx.db.insert('rulesets', {
      ...row,
      name: 'Synthetic ruleset',
      slug: `synthetic-ruleset-${suffix}`,
      about: 'A disposable ruleset for isolated browser verification.',
      image_cover: null,
    });
    for (const slot of ['treachery', 'spice'] as const) {
      const deckId = await ctx.db.insert('assets', {
        ...row,
        type: 'deck',
        slug: `synthetic-${slot}-deck-${suffix}`,
        data: { name: `Synthetic ${slot} deck`, about: '', cardback: publishingDeckCardback },
      });
      publications.push(await publish(ctx, 'deck', deckId, 'back'));
      for (const index of [1, 2, 3]) {
        const name = `Synthetic ${slot} card ${index}`;
        const cardId = await ctx.db.insert('assets', {
          ...row,
          type: 'card-treachery',
          slug: `synthetic-${slot}-card-${index}-${suffix}`,
          data: { ...publishingTreacheryCard, name },
        });
        await ctx.db.insert('asset_relations', {
          from_asset_id: deckId,
          to_asset_id: cardId,
          kind: 'deck-card',
          count: 2,
        });
        publications.push(await publish(ctx, 'card-treachery', cardId, 'front'));
      }
      await ctx.db.insert('ruleset_asset_slots', { ruleset_id: rulesetId, asset_id: deckId, slot });
    }
    for (const faction of SYNTHETIC_FACTIONS) {
      const factionId = await ctx.db.insert('factions', {
        ...row,
        slug: `${faction.slug}-${suffix}`,
        data: {
          ...assetPublishingFaction,
          name: faction.name,
          themeColor: faction.color,
          troops: assetPublishingFaction.troops.map((troop) => ({
            ...troop,
            name: 'Troops',
            combat: SYNTHETIC_TROOP_COMBAT,
          })),
        },
      });
      await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: factionId });
      publications.push(await publish(ctx, 'faction-token', factionId, 'front'));
    }
    return { rulesetId, publications };
  },
});

/** Seeds public catalogue definitions for the disposable browser run, with local publication bytes installed by its runner. */
export const seedPublicCatalogue = internalMutation({
  args: {},
  returns: v.array(publicationValidator),
  handler: async (ctx) => {
    requireSyntheticBackend();
    const owner = await catalogueOwner(ctx);
    const data = {
      name: 'Recovery token',
      about: '',
      front: publishingTokenFace,
      back: { mode: 'custom', face: { ...publishingTokenFace, top: 'BACK' } },
    };
    const assetId = await ctx.db.insert('assets', {
      owner_id: owner,
      type: 'token-disc',
      data,
      slug: 'recovery-token',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      group_id: null,
    });
    const publications = [];
    for (const face of ['front', 'back']) {
      publications.push(await publish(ctx, 'token-disc', face === 'front' ? assetId : `${assetId}.back`, face));
    }
    return publications;
  },
});
