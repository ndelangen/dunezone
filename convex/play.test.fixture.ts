/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';

import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

/** A fresh test world with the components Play's functions reach. */
export function playTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

/** A signed-in account with a live session, an unused refresh and a profile, as Play reads one. */
export async function playPerson(
  ctx: MutationCtx,
  name: string,
  { isAdmin = false, accountState = 'active' }: { isAdmin?: boolean; accountState?: 'active' | 'deleted' } = {}
) {
  const userId = await ctx.db.insert('users', { account_state: accountState, name, isAdmin });
  const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
  const refreshId = await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
  const stamp = new Date().toISOString();
  await ctx.db.insert('profiles', {
    user_id: userId,
    username: name,
    avatar_url: null,
    account_state: accountState,
    slug: name.toLowerCase(),
    created_at: stamp,
    updated_at: stamp,
  });
  return { userId, sessionId, refreshId, subject: `${userId}|${sessionId}` };
}

/** One ready ruleset with both decks linked, as the creation page requires. */
export async function playRuleset(ctx: MutationCtx, owner: Id<'users'>) {
  const stamp = new Date().toISOString();
  const rulesetId = await ctx.db.insert('rulesets', {
    name: 'Classic',
    about: 'The classic table, as printed.'.padEnd(60, '.'),
    created_at: stamp,
    updated_at: stamp,
    owner_id: owner,
    group_id: null,
    is_deleted: false,
    image_cover: null,
    slug: 'classic',
  });
  const card = await ctx.db.insert('assets', {
    owner_id: owner,
    type: 'card-treachery',
    data: { name: 'lasgun' },
    slug: 'lasgun',
    created_at: stamp,
    updated_at: stamp,
    is_deleted: false,
    group_id: null,
  });
  for (const slot of ['treachery', 'spice'] as const) {
    const deckId = await ctx.db.insert('assets', {
      owner_id: owner,
      type: 'deck',
      data: { name: slot, about: '', cardback: publishingDeckCardback },
      slug: slot,
      created_at: stamp,
      updated_at: stamp,
      is_deleted: false,
      group_id: null,
    });
    await ctx.db.insert('asset_relations', { from_asset_id: deckId, to_asset_id: card, kind: 'deck-card', count: 2 });
    await ctx.db.insert('ruleset_asset_slots', { ruleset_id: rulesetId, asset_id: deckId, slot });
  }
  return rulesetId;
}
