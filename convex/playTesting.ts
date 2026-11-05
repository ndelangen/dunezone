import { v } from 'convex/values';

import gf9BaseFactions from '../content/gf9/base-factions.json';
import type { PublicationAssetType } from '../src/shared/asset-publishing/publicationTargets';
import {
  isPublicationAssetType,
  publicationFaceId,
  publishedR2Key,
  publishedHref,
} from '../src/shared/asset-publishing/publicationTargets';
import { publishingCustomDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { IdentifiedFactionStoredSchema } from '../src/shared/factions/schema';
import { ensureFactionTroopIds } from '../src/shared/factions/troopIdentity';
import { PLAY_FIXTURE_KEY } from '../src/shared/play/admission';
import { arrakisBoardCapture } from '../src/shared/play/fixtures/board';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { newestUnusedRefresh } from './lib/authSessionLifecycle';
import { isSyntheticFixtureKey, playCredential, syntheticFixtureKey } from './lib/playAuthorization';
import { insertPendingGame } from './lib/playProvisioningSchedule';
import { limitLiveGames, requireSyntheticBackend } from './lib/playSynthetic';
import { patchStoredAvatar, profileAvatarValidator } from './lib/profileAvatar';
import { ensureProfileForUser, profileSourcesFromUserDoc } from './lib/profileBootstrap';
import { checksPbkdf2Passwords, isPbkdf2Secret } from './lib/syntheticPasswords';

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
  const refresh = await newestUnusedRefresh(ctx, sessionId);
  if (!refresh) {
    throw new Error('Synthetic refresh token not found');
  }
  return refresh;
}

function isLocalFixtureKey(key: string | undefined) {
  return key === PLAY_FIXTURE_KEY || isSyntheticFixtureKey(key);
}

function requireSyntheticEmail(email: string | undefined) {
  if (!email?.endsWith('@example.invalid')) {
    throw new Error('Play test controls only accept synthetic accounts');
  }
}

async function requireSyntheticUser(ctx: MutationCtx, userId: Id<'users'>) {
  requireSyntheticEmail((await ctx.db.get(userId))?.email);
}

/** Password's default stored secret: Lucia's Scrypt output, a 16-byte hex salt and a 64-byte hex key. */
const SCRYPT_SECRET = /^[a-f0-9]{32}:[a-f0-9]{128}$/;

/**
 * Creates synthetic Password accounts before a run's browsers start, so a browser's sign-in finds its account and never creates one.
 * It writes the rows Password's sign-up writes, with a secret the runner already hashed, so no hashing runs inside this mutation.
 * The runner cannot tell which hash this backend's Password checks, so it sends each password as Scrypt and as PBKDF2, and this keeps the one Password checks here (`lib/syntheticPasswords.ts`).
 * An account that already exists keeps its password, as a later run with the same credentials file expects.
 */
export const provisionAccounts = internalMutation({
  args: {
    accounts: v.array(
      v.object({
        email: v.string(),
        scrypt: v.string(),
        pbkdf2: v.string(),
        avatar: v.optional(profileAvatarValidator),
        /* The display name a game shows for the account's seat; a local bot game gives each account an ordinary name. */
        name: v.optional(v.string()),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyntheticBackend();
    const checksPbkdf2 = checksPbkdf2Passwords();
    for (const { email, scrypt, pbkdf2, avatar, name } of args.accounts) {
      requireSyntheticEmail(email);
      if (!SCRYPT_SECRET.test(scrypt) || !isPbkdf2Secret(pbkdf2)) {
        throw new Error('Synthetic accounts need a Scrypt secret and a PBKDF2 secret, not a password');
      }
      const existing = await ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (q) => q.eq('provider', 'password').eq('providerAccountId', email))
        .unique();
      if (existing && !avatar) {
        continue;
      }
      const userId =
        existing?.userId ?? (await ctx.db.insert('users', { email, ...(name ? { name: name.slice(0, 60) } : {}) }));
      const user = await ctx.db.get(userId);
      if (!user) {
        throw new Error('Failed to read the synthetic user after insert');
      }
      /* The same profile Auth's afterUserCreatedOrUpdated callback creates for a new Password account. */
      const profile = await ensureProfileForUser(ctx, userId, profileSourcesFromUserDoc(user));
      if (avatar) {
        await patchStoredAvatar(ctx, profile._id, avatar);
      }
      if (existing) {
        continue;
      }
      const secret = checksPbkdf2 ? pbkdf2 : scrypt;
      await ctx.db.insert('authAccounts', { userId, provider: 'password', providerAccountId: email, secret });
    }
    return null;
  },
});

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
  args: {},
  returns: v.object({ gameId: v.id('play_games'), secret: v.string(), attemptId: v.string(), expiresAt: v.number() }),
  handler: async (ctx) => {
    requireSyntheticBackend();
    await limitLiveGames(ctx);
    return await insertPendingGame(ctx, { fixture_key: syntheticFixtureKey() });
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

/* `source` names the mirrored image (its published path on the live site) whose bytes the runner installs instead of a synthetic face. */
const publicationValidator = v.object({
  key: v.string(),
  href: v.string(),
  face: v.string(),
  source: v.optional(v.string()),
});

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

/** Each required deck holds members of its own card type, so the seed exercises both card renderers and publications. */
const SYNTHETIC_DECK_MEMBERS = {
  treachery: { type: 'card-treachery', data: publishingTreacheryCard },
  spice: { type: 'card-spice', data: publishingSpiceCard },
} as const;

/*
 * Authored values the browser support case needs: five troops cost five spice, three troops cost three.
 * The Harkonnen colour is a saturated red so the carry checks can find its troop tokens by their pixels.
 */
const SYNTHETIC_TROOP_BATTLE = { strength: 0.5, supportedStrength: 1, supportCost: 1 };

/** The Extra one seeded faction supplies at setup; the regular flow finds it in that faction's hand by this name. */
const SYNTHETIC_EXTRA_NAME = 'Synthetic extra';

/*
 * One faction declares phases, so every two-seat game composes them (#1232 H1).
 * The prediction is #1466's production declaration; the instruction step is ready-gated, as an authored step may be.
 */
const SYNTHETIC_PHASES = [
  {
    id: 'prediction',
    type: 'prediction',
    title: 'Bene Gesserit prediction',
    symbol: '/vector/icon/fate.svg',
    before: 'traitors',
    priority: 10,
    allPlayersMustBeReady: false,
    instructions:
      'During setup secretly choose a turn number and a faction. If that faction wins the game on that turn, you win instead. (Fremen Special Victory condition does not count)',
  },
  {
    id: 'muster',
    type: 'instruction',
    title: 'Synthetic muster',
    symbol: '/vector/icon/fate.svg',
    before: 'forces',
    priority: 10,
    allPlayersMustBeReady: true,
    instructions: 'Every player confirms Ready before starting troops.',
  },
] as const;

const SYNTHETIC_FACTIONS = [
  { slug: 'synthetic-harkonnen', name: 'Harkonnen', color: '#b3261e', declares: true },
  { slug: 'synthetic-atreides', name: 'Atreides', color: '#75d8a7', declares: false },
];

/**
 * Seeds a ruleset an Administrator can start a real game with on the disposable browser backend: both required decks, and two linked factions with published tokens and authored troop battle values.
 * The Harkonnen also supply an Extra and declare a prediction and an instruction phase, so real games carry custom content.
 * Returns the publications whose local bytes the runner installs.
 */
/**
 * The published GF9 base factions by short name (`fremen`, `emperor`, ...), without their extras, for a local game against a bot.
 * Their leaders, troops and rules text are the real ones;
 * the ruleset's decks stay synthetic.
 */
function gf9Faction(shortName: string) {
  const wanted = shortName.trim().toLowerCase();
  const source = gf9BaseFactions.find((faction) => faction.name.toLowerCase().replace(/^gf9 /u, '') === wanted);
  if (!source) {
    throw new Error(`No GF9 base faction called ${shortName}.`);
  }
  const data = IdentifiedFactionStoredSchema.parse({ ...source, extras: [], extraPhases: [] });
  return { slug: `gf9-${wanted.replace(/[^a-z0-9]+/gu, '-')}`, data };
}

export const seedRealGameCatalogue = internalMutation({
  /* `gf9Factions` swaps the two synthetic factions for these GF9 base factions, for `verify-hosted-play-stack --serve`. */
  /* `rulesetName` names the ruleset a person picks on the create page, such as a mirrored ruleset's local copy. */
  args: { gf9Factions: v.optional(v.array(v.string())), rulesetName: v.optional(v.string()) },
  returns: v.object({ rulesetId: v.id('rulesets'), publications: v.array(publicationValidator) }),
  handler: async (ctx, { gf9Factions, rulesetName }) => {
    requireSyntheticBackend();
    const owner = await catalogueOwner(ctx);
    const stamp = new Date().toISOString();
    const row = { owner_id: owner, created_at: stamp, updated_at: stamp, is_deleted: false, group_id: null };
    const publications = [];
    /* Slugs resolve a capture and a ruleset page, so each seed's rows stay distinct from an earlier seed's on the same backend. */
    const suffix = playCredential().slice(0, 8);
    const rulesetId = await ctx.db.insert('rulesets', {
      ...row,
      name: rulesetName?.slice(0, 120) ?? 'Synthetic ruleset',
      slug: `synthetic-ruleset-${suffix}`,
      about: 'A disposable ruleset for isolated browser verification.',
      image_cover: null,
    });
    const boardId = await ctx.db.insert('assets', {
      ...row,
      type: 'board',
      slug: `synthetic-board-${suffix}`,
      data: { name: 'Arrakis Official', about: '', board: arrakisBoardCapture.definition },
    });
    await ctx.db.insert('ruleset_asset_slots', { ruleset_id: rulesetId, asset_id: boardId, slot: 'board' });
    for (const slot of ['treachery', 'spice'] as const) {
      const deckId = await ctx.db.insert('assets', {
        ...row,
        type: 'deck',
        slug: `synthetic-${slot}-deck-${suffix}`,
        data: { name: `Synthetic ${slot} deck`, about: '', cardback: publishingCustomDeckCardback },
      });
      publications.push(await publish(ctx, 'deck', deckId, 'back'));
      const member = SYNTHETIC_DECK_MEMBERS[slot];
      for (const index of [1, 2, 3]) {
        const name = `Synthetic ${slot} card ${index}`;
        const cardId = await ctx.db.insert('assets', {
          ...row,
          type: member.type,
          slug: `synthetic-${slot}-card-${index}-${suffix}`,
          data: { ...member.data, name },
        });
        await ctx.db.insert('asset_relations', {
          from_asset_id: deckId,
          to_asset_id: cardId,
          kind: 'deck-card',
          count: 2,
        });
        publications.push(await publish(ctx, member.type, cardId, 'front'));
      }
      await ctx.db.insert('ruleset_asset_slots', { ruleset_id: rulesetId, asset_id: deckId, slot });
    }
    const extraSlug = `synthetic-extra-${suffix}`;
    const extraId = await ctx.db.insert('assets', {
      ...row,
      type: 'token-disc',
      slug: extraSlug,
      data: { name: SYNTHETIC_EXTRA_NAME, about: '', front: publishingTokenFace, back: { mode: 'same' } },
    });
    publications.push(await publish(ctx, 'token-disc', extraId, 'front'));
    for (const { slug, data } of (gf9Factions ?? []).map(gf9Faction)) {
      const factionId = await ctx.db.insert('factions', { ...row, slug: `${slug}-${suffix}`, data });
      await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: factionId, position: Date.now() });
      publications.push(await publish(ctx, 'faction-token', factionId, 'front'));
      publications.push(await publish(ctx, 'faction-token', publicationFaceId(factionId, 'back'), 'back'));
    }
    for (const faction of gf9Factions?.length ? [] : SYNTHETIC_FACTIONS) {
      const factionId = await ctx.db.insert('factions', {
        ...row,
        slug: `${faction.slug}-${suffix}`,
        data: ensureFactionTroopIds({
          ...assetPublishingFaction,
          name: faction.name,
          themeColor: faction.color,
          troops: assetPublishingFaction.troops.map((troop) => ({
            ...troop,
            name: 'Troops',
            combat: SYNTHETIC_TROOP_BATTLE,
          })),
          ...(faction.declares
            ? { extras: [{ type: 'token-disc', slug: extraSlug }], extraPhases: [...SYNTHETIC_PHASES] }
            : {}),
        }),
      });
      await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: factionId, position: Date.now() });
      publications.push(await publish(ctx, 'faction-token', factionId, 'front'));
      publications.push(await publish(ctx, 'faction-token', publicationFaceId(factionId, 'back'), 'back'));
    }
    return { rulesetId, publications };
  },
});

/**
 * Puts a mirrored ruleset's own decks and factions on a seeded ruleset, so the create page lists what the game will deal:
 * the real deck names and counts, and the factions with their tokens. Games still read their catalogue through the mirror;
 * these rows only stand behind the page's manifest. Each publication names the mirrored image the runner installs for it.
 */
export const seedMirrorPreview = internalMutation({
  args: {
    rulesetId: v.id('rulesets'),
    boardName: v.string(),
    boardImage: v.optional(v.string()),
    decks: v.array(
      v.object({
        slot: v.union(
          v.literal('treachery'),
          v.literal('spice'),
          v.literal('custom'),
          v.literal('techToken'),
          v.literal('customTokens')
        ),
        type: v.string(),
        name: v.string(),
        data: v.any(),
        image: v.optional(v.string()),
        members: v.array(
          v.object({
            type: v.string(),
            name: v.string(),
            count: v.number(),
            image: v.optional(v.string()),
          })
        ),
      })
    ),
    factions: v.array(
      v.object({
        data: v.any(),
        token: v.optional(v.string()),
        tokenBack: v.optional(v.string()),
      })
    ),
  },
  returns: v.array(publicationValidator),
  handler: async (ctx, { rulesetId, boardName, boardImage, decks, factions }) => {
    requireSyntheticBackend();
    const owner = await catalogueOwner(ctx);
    const stamp = new Date().toISOString();
    const row = {
      owner_id: owner,
      created_at: stamp,
      updated_at: stamp,
      is_deleted: false,
      group_id: null,
    };
    const suffix = playCredential().slice(0, 8);
    const publications = [];
    const mirrored = async (type: PublicationAssetType, id: string, face: string, source: string | undefined) =>
      source ? [{ ...(await publish(ctx, type, id, face)), source }] : [];
    /* The synthetic decks and factions this ruleset was seeded with give way to the mirrored ones. */
    for (const slot of await ctx.db
      .query('ruleset_asset_slots')
      .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', rulesetId))
      .collect()) {
      if (slot.slot === 'board') {
        const board = await ctx.db.get(slot.asset_id);
        if (board) {
          await ctx.db.patch(board._id, {
            data: { ...board.data, name: boardName },
          });
          publications.push(...(await mirrored('board', board._id, 'front', boardImage)));
        }
        continue;
      }
      await ctx.db.delete(slot._id);
    }
    for (const link of await ctx.db
      .query('ruleset_factions')
      .withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', rulesetId))
      .collect()) {
      await ctx.db.delete(link._id);
    }
    for (const [index, deck] of decks.entries()) {
      const deckId = await ctx.db.insert('assets', {
        ...row,
        type: deck.type,
        slug: `mirror-${deck.slot}-${index}-${suffix}`,
        data: deck.data,
      });
      if (deck.type === 'deck') {
        publications.push(...(await mirrored('deck', deckId, 'back', deck.image)));
      }
      for (const [position, member] of deck.members.entries()) {
        const memberId = await ctx.db.insert('assets', {
          ...row,
          type: member.type,
          slug: `mirror-${deck.slot}-${index}-${position}-${suffix}`,
          data: { name: member.name },
        });
        if (isPublicationAssetType(member.type)) {
          publications.push(...(await mirrored(member.type, memberId, 'front', member.image)));
        }
        await ctx.db.insert('asset_relations', {
          from_asset_id: deckId,
          to_asset_id: memberId,
          kind: deck.type === 'deck' ? 'deck-card' : 'bundle-token',
          count: member.count,
        });
      }
      await ctx.db.insert('ruleset_asset_slots', {
        ruleset_id: rulesetId,
        asset_id: deckId,
        slot: deck.slot,
      });
    }
    for (const [position, faction] of factions.entries()) {
      const factionId = await ctx.db.insert('factions', {
        ...row,
        slug: `mirror-faction-${position}-${suffix}`,
        data: faction.data,
      });
      await ctx.db.insert('ruleset_factions', {
        ruleset_id: rulesetId,
        faction_id: factionId,
        position,
      });
      publications.push(...(await mirrored('faction-token', factionId, 'front', faction.token)));
      publications.push(
        ...(await mirrored('faction-token', publicationFaceId(factionId, 'back'), 'back', faction.tokenBack))
      );
    }
    return publications;
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
