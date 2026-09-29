/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { generateKeyPairSync, randomBytes } from 'node:crypto';

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { passwordSecret } from '../scripts/lib/synthetic-accounts';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

beforeEach(() => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
  vi.stubEnv('JWT_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function backend() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

function account(label: string) {
  return {
    email: `${label}-${randomBytes(4).toString('hex')}@example.invalid`,
    password: randomBytes(24).toString('hex'),
  };
}

function signIn(
  t: ReturnType<typeof backend>,
  flow: 'signIn' | 'signUp',
  { email, password }: ReturnType<typeof account>
) {
  return t.action(api.auth.signIn, { provider: 'password', params: { flow, email, password } });
}

/** Drops the fields that differ between any two accounts: ids, times, emails, slugs and secrets. */
function shared(row: object, differing: string[]) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !['_id', '_creationTime', ...differing].includes(key))
  );
}

/** Each account's rows as Password's sign-up leaves them, with the fields every account has its own value for dropped. */
async function accountRows(t: ReturnType<typeof backend>) {
  return await t.run(async (ctx) => {
    const accounts = await ctx.db.query('authAccounts').collect();
    return await Promise.all(
      accounts.map(async (account) => {
        const user = await ctx.db.get(account.userId);
        const profile = await ctx.db
          .query('profiles')
          .withIndex('by_user_id', (q) => q.eq('user_id', account.userId))
          .unique();
        return {
          account: shared(account, ['userId', 'providerAccountId', 'secret']),
          secret: /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(account.secret ?? ''),
          user: user && shared(user, ['email']),
          profile: profile && shared(profile, ['user_id', 'slug', 'created_at', 'updated_at']),
        };
      })
    );
  });
}

async function rowCounts(t: ReturnType<typeof backend>) {
  return await t.run(async (ctx) => ({
    users: (await ctx.db.query('users').collect()).length,
    authAccounts: (await ctx.db.query('authAccounts').collect()).length,
    profiles: (await ctx.db.query('profiles').collect()).length,
  }));
}

test('a provisioned account has the rows sign-up writes, and signing it in creates nothing', async () => {
  const t = backend();
  const signedUp = account('signed-up');
  await signIn(t, 'signUp', signedUp);
  const [signUpRows] = await accountRows(t);

  const provisioned = account('player-a');
  await t.mutation(internal.playTesting.provisionAccounts, {
    accounts: [{ email: provisioned.email, secret: await passwordSecret(provisioned.password) }],
  });
  const rows = await accountRows(t);
  expect(rows).toHaveLength(2);
  expect(rows[1]).toEqual(signUpRows);

  const before = await rowCounts(t);
  const result = await signIn(t, 'signIn', provisioned);
  expect(result.tokens?.token).toEqual(expect.any(String));
  expect(await rowCounts(t)).toEqual(before);
});

test('an existing account keeps its password, and only synthetic accounts with a Scrypt secret are accepted', async () => {
  const t = backend();
  const player = account('player-b');
  await t.mutation(internal.playTesting.provisionAccounts, {
    accounts: [{ email: player.email, secret: await passwordSecret(player.password) }],
  });
  await t.mutation(internal.playTesting.provisionAccounts, {
    accounts: [{ email: player.email, secret: await passwordSecret(account('other').password) }],
  });
  expect((await signIn(t, 'signIn', player)).tokens?.token).toEqual(expect.any(String));
  await expect(
    t.mutation(internal.playTesting.provisionAccounts, {
      accounts: [{ email: 'player@example.com', secret: await passwordSecret(player.password) }],
    })
  ).rejects.toThrow('synthetic accounts');
  await expect(
    t.mutation(internal.playTesting.provisionAccounts, {
      accounts: [{ email: account('plain').email, secret: player.password }],
    })
  ).rejects.toThrow('Scrypt secret');
});
