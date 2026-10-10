/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function setup() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const { userId, sessionId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { account_state: 'active' });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'ExamplePlayer',
      slug: 'exampleplayer',
      avatar_url: 'https://example.com/avatar.png',
      account_state: 'active',
      created_at: '2026-10-10T00:00:00.000Z',
      updated_at: '2026-10-10T00:00:00.000Z',
    });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 60_000 });
    return { userId, sessionId };
  });
  return { t, owner: t.withIdentity({ subject: `${userId}|${sessionId}` }) };
}

const profileInput = { username: 'ExamplePlayer', avatar_url: 'https://example.com/avatar.png' };

test('a BGG link is normalized, public, preserved by older saves and removed by clearing it', async () => {
  const { t, owner } = await setup();
  await owner.mutation(api.profiles.updateCurrent, {
    ...profileInput,
    bgg_profile_url: ' https://www.boardgamegeek.com/user/Example%20Player/?ref=share#profile ',
  });
  expect((await t.query(api.profiles.getBySlug, { slug: 'exampleplayer' })).profile.bgg_profile_url).toBe(
    'https://boardgamegeek.com/user/Example%20Player'
  );
  const olderSave = await owner.mutation(api.profiles.updateCurrent, profileInput);
  expect(olderSave.profile.bgg_profile_url).toBe('https://boardgamegeek.com/user/Example%20Player');
  await owner.mutation(api.profiles.updateCurrent, { ...profileInput, bgg_profile_url: '   ' });
  expect((await t.query(api.profiles.getBySlug, { slug: 'exampleplayer' })).profile.bgg_profile_url).toBeUndefined();
});

test('profile saves reject external destinations and URLs that do not name a BGG user', async () => {
  const { owner } = await setup();
  for (const bgg_profile_url of [
    'https://boardgamegeek.com.example.com/user/ExamplePlayer',
    'https://boardgamegeek.com@evil.example/user/ExamplePlayer',
    'https://boardgamegeek.com/boardgame/121',
    'https://boardgamegeek.com/user/%2fadmin',
    'http://boardgamegeek.com/user/ExamplePlayer',
  ]) {
    await expect(owner.mutation(api.profiles.updateCurrent, { ...profileInput, bgg_profile_url })).rejects.toThrow(
      'Enter a BoardGameGeek profile URL'
    );
  }
});
