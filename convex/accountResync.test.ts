/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { account, restoreAuthEnvironment, setup, stubAuthEnvironment } from './authAccount.test.fixture';
import type { AuthProvider } from './lib/accountMethods';

beforeEach(stubAuthEnvironment);
afterEach(() => {
  restoreAuthEnvironment();
  vi.unstubAllGlobals();
});

type Fixture = ReturnType<typeof setup>;
type Account = Awaited<ReturnType<typeof account>>;

const viewer = (t: Fixture, own: Account) => t.withIdentity({ subject: `${own.userId}|${own.sessionId}` });

type Report = { name: string | null; image: string | null };

function recorded(t: Fixture, userId: Id<'users'>, provider: AuthProvider, { name, image }: Report) {
  return t.run((ctx) =>
    ctx.db.insert('linked_account_profiles', {
      user_id: userId,
      provider,
      name,
      image,
      synced_at: 1000,
    })
  );
}

function connect(t: Fixture, userId: Id<'users'>, provider: AuthProvider, providerAccountId = `${provider}-id`) {
  return t.run((ctx) => ctx.db.insert('authAccounts', { userId, provider, providerAccountId }));
}

const profileOf = (t: Fixture, profileId: Id<'profiles'>) => t.run((ctx) => ctx.db.get(profileId));

describe('display names from provider names', () => {
  /* Driven through the resync itself: the reduction is read off the option the one connected method offers. */
  test.each([
    ['Norbert de Langen', 'NorbertdeLangen'],
    ['René Müller', 'ReneMuller'],
    ['ALLCAPS', 'Allcaps'],
    ['steam_player-99', 'steamplayer99'],
    ['Bo', null],
    ['12345', '12345'],
  ])('%j becomes %j', async (name, expected) => {
    const t = setup();
    const own = await account(t, 'oldname', 'google');
    await recorded(t, own.userId, 'google', { name, image: null });
    const result = await viewer(t, own).action(api.accountResync.resync, {});
    expect(result.options).toEqual([expect.objectContaining({ provider: 'google', name, displayName: expected })]);
    expect(result.kind).toBe(expected === null ? 'nothing' : 'applied');
  });

  test('an empty report offers no name', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'google');
    await recorded(t, own.userId, 'google', { name: null, image: null });
    const result = await viewer(t, own).action(api.accountResync.resync, {});
    expect(result).toMatchObject({ kind: 'nothing', options: [{ provider: 'google', name: null, displayName: null }] });
  });
});

describe('resync', () => {
  test('refuses a signed-out reader', async () => {
    const t = setup();
    await expect(t.action(api.accountResync.resync, {})).rejects.toThrow('Not authenticated');
  });

  test('one connected method with a report: the profile takes its name and picture at once', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'google');
    await recorded(t, own.userId, 'google', {
      name: 'Norbert de Langen',
      image: 'https://lh3.example/photo.jpg',
    });
    const result = await viewer(t, own).action(api.accountResync.resync, {});
    expect(result).toMatchObject({
      kind: 'applied',
      applied: {
        provider: 'google',
        name: true,
        avatar: true,
        profile: {
          username: 'NorbertdeLangen',
          avatar_url: 'https://lh3.example/photo.jpg',
          slug: 'norbertdelangen',
        },
      },
    });
    expect(await profileOf(t, own.profileId)).toMatchObject({
      username: 'NorbertdeLangen',
      avatar_url: 'https://lh3.example/photo.jpg',
      avatar: null,
      slug: 'norbertdelangen',
    });
    /* The rename keeps the old address redirecting, as a save from the settings form does. */
    const former = await t.run((ctx) =>
      ctx.db
        .query('former_slugs')
        .withIndex('by_kind_and_scope_and_slug', (q) => q.eq('kind', 'profile').eq('scope', '').eq('slug', 'oldname'))
        .unique()
    );
    expect(former).toMatchObject({ record_id: own.profileId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test('an account whose only method signed in before reports were kept offers what the account itself holds', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'discord');
    await t.run((ctx) =>
      ctx.db.patch(own.userId, {
        name: 'Discord Name',
        image: 'https://cdn.discordapp.com/a.png',
      })
    );
    const result = await viewer(t, own).action(api.accountResync.resync, {});
    expect(result).toMatchObject({
      kind: 'applied',
      applied: {
        provider: 'discord',
        profile: {
          username: 'DiscordName',
          avatar_url: 'https://cdn.discordapp.com/a.png',
        },
      },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test('a name the rules refuse leaves the name alone and still takes the picture', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'google');
    await recorded(t, own.userId, 'google', {
      name: 'Bo',
      image: 'https://lh3.example/photo.jpg',
    });
    const result = await viewer(t, own).action(api.accountResync.resync, {});
    expect(result).toMatchObject({
      kind: 'applied',
      applied: { name: false, avatar: true },
    });
    expect(await profileOf(t, own.profileId)).toMatchObject({
      username: 'oldname',
      slug: 'oldname',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test('a picture the profile already shows is not fetched again', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'google');
    await t.run((ctx) =>
      ctx.db.patch(own.profileId, {
        avatar_url: 'https://stored.example/avatar.webp',
        avatar: {
          url: 'https://stored.example/avatar.webp',
          source_url: 'https://lh3.example/photo.jpg',
          width: 256,
          height: 256,
        },
      })
    );
    await recorded(t, own.userId, 'google', {
      name: 'oldname',
      image: 'https://lh3.example/photo.jpg',
    });
    const result = await viewer(t, own).action(api.accountResync.resync, {});
    expect(result).toMatchObject({
      kind: 'applied',
      applied: { name: false, avatar: false },
    });
    expect((await profileOf(t, own.profileId))!.avatar).not.toBeNull();
  });

  test('no method has reported anything yet', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'google');
    await connect(t, own.userId, 'discord');
    const result = await viewer(t, own).action(api.accountResync.resync, {});
    expect(result).toMatchObject({ kind: 'nothing' });
    expect((result as { options: unknown[] }).options).toHaveLength(2);
    expect(await profileOf(t, own.profileId)).toMatchObject({
      username: 'oldname',
      avatar_url: null,
    });
  });

  test('several methods with reports: the reader chooses, then one applies', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'google');
    await connect(t, own.userId, 'discord');
    await recorded(t, own.userId, 'google', {
      name: 'Google Name',
      image: 'https://lh3.example/photo.jpg',
    });
    await recorded(t, own.userId, 'discord', {
      name: 'discordian',
      image: null,
    });
    const me = viewer(t, own);
    const result = await me.action(api.accountResync.resync, {});
    expect(result).toEqual({
      kind: 'choose',
      options: [
        {
          provider: 'google',
          name: 'Google Name',
          displayName: 'GoogleName',
          image: 'https://lh3.example/photo.jpg',
          syncedAt: 1000,
        },
        {
          provider: 'discord',
          name: 'discordian',
          displayName: 'discordian',
          image: null,
          syncedAt: 1000,
        },
      ],
    });
    expect(await profileOf(t, own.profileId)).toMatchObject({
      username: 'oldname',
    });
    const applied = await me.mutation(api.accountResync.apply, {
      provider: 'discord',
    });
    expect(applied).toMatchObject({
      provider: 'discord',
      name: true,
      avatar: false,
      profile: { username: 'discordian' },
    });
    expect(await profileOf(t, own.profileId)).toMatchObject({
      username: 'discordian',
      slug: 'discordian',
      avatar_url: null,
    });
  });

  test('applying a method that is not connected, or has nothing to offer, is refused', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'google');
    await connect(t, own.userId, 'discord');
    const me = viewer(t, own);
    await expect(me.mutation(api.accountResync.apply, { provider: 'steam' })).rejects.toThrow('not connected');
    await expect(me.mutation(api.accountResync.apply, { provider: 'discord' })).rejects.toThrow('not reported');
  });

  test('a resync is refused while a merge rewrites the account', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'google');
    await recorded(t, own.userId, 'google', { name: 'Norbert de Langen', image: null });
    await t.run(async (ctx) => {
      const operationId = await ctx.db.insert('account_merge_operations', {
        source_user_id: own.userId,
        source_profile_id: own.profileId,
        target_user_id: own.userId,
        target_profile_id: own.profileId,
        requested_by: own.userId,
        source_name: 'other',
        target_name: 'oldname',
        target_slug: 'oldname',
        state: 'running',
        phase: 0,
        error: null,
        created_at: Date.now(),
        completed_at: null,
      });
      await ctx.db.patch(own.userId, { account_merge_operation_id: operationId });
    });
    await expect(viewer(t, own).action(api.accountResync.resync, {})).rejects.toThrow('merge in progress');
    expect((await profileOf(t, own.profileId))?.username).toBe('oldname');
  });

  test('what Steam said about an account that is no longer the connected one is not kept', async () => {
    const t = setup();
    const own = await account(t, 'oldname', 'steam');
    await t.run((ctx) => ctx.db.patch(own.authId, { providerAccountId: '76561197960287930' }));
    const kept = await viewer(t, own).mutation(internal.accountResync.recordLive, {
      provider: 'steam',
      providerAccountId: '76561197960000000',
      name: 'Someone Else',
    });
    expect(kept).toBe(false);
    const rows = await t.run((ctx) => ctx.db.query('linked_account_profiles').collect());
    expect(rows).toEqual([]);
  });

  test('Steam is asked live, and what it says is kept for next time', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    const steamFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      expect(url.origin + url.pathname).toBe('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
      expect(url.searchParams.get('steamids')).toBe('76561197960287930');
      return Response.json({
        response: {
          players: [
            {
              personaname: 'Muad Dib',
              avatarfull: 'https://avatars.steamstatic.com/full.jpg',
            },
          ],
        },
      });
    });
    vi.stubGlobal('fetch', steamFetch);
    const t = setup();
    const own = await account(t, 'oldname', 'steam');
    await t.run(async (ctx) => {
      await ctx.db.patch(own.authId, {
        providerAccountId: '76561197960287930',
      });
    });
    const result = await viewer(t, own).action(api.accountResync.resync, {});
    expect(steamFetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      kind: 'applied',
      applied: {
        provider: 'steam',
        profile: {
          username: 'MuadDib',
          avatar_url: 'https://avatars.steamstatic.com/full.jpg',
        },
      },
    });
    const kept = await t.run((ctx) =>
      ctx.db
        .query('linked_account_profiles')
        .withIndex('by_user_id_and_provider', (q) => q.eq('user_id', own.userId).eq('provider', 'steam'))
        .unique()
    );
    expect(kept).toMatchObject({
      name: 'Muad Dib',
      image: 'https://avatars.steamstatic.com/full.jpg',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test('a failed Steam lookup keeps the last report instead of blanking it', async () => {
    vi.stubEnv('STEAM_WEB_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );
    const t = setup();
    const own = await account(t, 'oldname', 'steam');
    await recorded(t, own.userId, 'steam', {
      name: 'Earlier Name',
      image: null,
    });
    const result = await viewer(t, own).action(api.accountResync.resync, {});
    expect(result).toMatchObject({
      kind: 'applied',
      applied: { profile: { username: 'EarlierName' } },
    });
  });
});

describe('sign-ins keep each method’s report', () => {
  test('a Discord sign-in records the name Discord sent, by provider', async () => {
    const t = setup();
    const signature = crypto.randomUUID();
    await t.run((ctx) => ctx.db.insert('authVerifiers', { signature }));
    await t.mutation(internal.auth.store, {
      args: {
        type: 'userOAuth',
        provider: 'discord',
        providerAccountId: 'discord-123',
        profile: {
          name: 'Discordian',
          image: 'https://cdn.discordapp.com/avatars/1/a.png',
        },
        signature,
      },
    });
    const kept = await t.run(async (ctx) => {
      const auth = await ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (q) => q.eq('provider', 'discord').eq('providerAccountId', 'discord-123'))
        .unique();
      return await ctx.db
        .query('linked_account_profiles')
        .withIndex('by_user_id_and_provider', (q) => q.eq('user_id', auth!.userId).eq('provider', 'discord'))
        .unique();
    });
    expect(kept).toMatchObject({
      name: 'Discordian',
      image: 'https://cdn.discordapp.com/avatars/1/a.png',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});
