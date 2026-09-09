/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function authFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

/* Exercise the same Auth mutation and application callback as the Discord HTTP callback. */
async function completeDiscordCallback(t: ReturnType<typeof authFixture>, accountId: string, name?: string) {
  const signature = crypto.randomUUID();
  await t.run((ctx) => ctx.db.insert('authVerifiers', { signature }));
  const code = await t.mutation(internal.auth.store, {
    args: {
      type: 'userOAuth',
      provider: 'discord',
      providerAccountId: accountId,
      profile: name === undefined ? {} : { name },
      signature,
    },
  });
  expect(code).toEqual(expect.any(String));
  return await t.run(async (ctx) => {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) => q.eq('provider', 'discord').eq('providerAccountId', accountId))
      .unique();
    if (!account) {
      throw new Error('The Discord callback did not create an account');
    }
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', account.userId))
      .unique();
    if (!profile) {
      throw new Error('The Discord callback did not create a profile');
    }
    return profile;
  });
}

beforeEach(() => {
  vi.stubEnv('AUTH_DISCORD_ID', 'test-discord-client');
  vi.stubEnv('AUTH_DISCORD_SECRET', 'test-discord-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Discord profile creation', () => {
  test.each([
    { name: '𝓝𝓸𝓻𝓫𝓮𝓻𝓽', slug: 'norbert' },
    { name: 'Ｐａｕｌ ①②', slug: 'paul-12' },
    { name: 'René', slug: 'rene' },
    { name: 'Rene\u0301', slug: 'rene' },
    { name: '🌙', slug: 'player' },
    { name: '王', slug: 'player' },
    { name: '---', slug: 'player' },
    { name: undefined, slug: 'nameless' },
  ])('completes the callback for $name with URL slug $slug', async ({ name, slug }) => {
    const profile = await completeDiscordCallback(authFixture(), 'new-account', name);
    expect(profile).toMatchObject({ username: name ?? 'nameless', slug, account_state: 'active' });
  });

  test('allocates distinct URLs when normalized names or fallback names collide', async () => {
    const t = authFixture();
    const plain = await completeDiscordCallback(t, 'plain', 'Norbert');
    const decorative = await completeDiscordCallback(t, 'decorative', '𝓝𝓸𝓻𝓫𝓮𝓻𝓽');
    const player = await completeDiscordCallback(t, 'player', 'Player');
    const emoji = await completeDiscordCallback(t, 'emoji', '🌙');
    const chinese = await completeDiscordCallback(t, 'chinese', '王');
    expect([plain.slug, decorative.slug, player.slug, emoji.slug, chinese.slug]).toEqual([
      'norbert',
      'norbert-2',
      'player',
      'player-2',
      'player-3',
    ]);
  });

  test('signing in again preserves an existing profile URL and chosen display name', async () => {
    const t = authFixture();
    const original = await completeDiscordCallback(t, 'returning-account', 'René');
    await t.run((ctx) => ctx.db.patch(original._id, { slug: 'ren', username: 'Chosen name' }));

    const returning = await completeDiscordCallback(t, 'returning-account', '𝓝𝓸𝓻𝓫𝓮𝓻𝓽');
    expect(returning).toMatchObject({ _id: original._id, slug: 'ren', username: 'Chosen name' });
  });
});
