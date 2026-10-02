/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { generateKeyPairSync, randomBytes } from 'node:crypto';

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { passwordDigest, passwordSecret } from '../scripts/lib/synthetic-accounts';
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

/*
 * Password hashes and checks each password with Lucia's Scrypt, written in JavaScript, and coverage-v8 counts every block of its loop.
 * One Scrypt took about 0.1 s without coverage and 1 s with it on an idle Mac, and 2.9 to 3.4 s in CI's coverage run, which runs test files in parallel.
 * Its loop awaits only microtasks, so no timer fires until it finishes: a slow Scrypt fails as a test timeout, and the `auth:store` lines Vitest prints above it show which Password call it was.
 * So each test makes one Password call, and PASSWORD_TEST_BUDGET_MS covers it about four times over.
 */
const PASSWORD_TEST_BUDGET_MS = 15_000;

function signIn(
  t: ReturnType<typeof backend>,
  flow: 'signIn' | 'signUp',
  { email, password }: ReturnType<typeof account>
) {
  return t.action(api.auth.signIn, { provider: 'password', params: { flow, email, password } });
}

async function provision(t: ReturnType<typeof backend>, { email, password }: ReturnType<typeof account>) {
  await t.mutation(internal.playTesting.provisionAccounts, {
    accounts: [{ email, scrypt: await passwordSecret(password), sha256: passwordDigest(password) }],
  });
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

test(
  'a provisioned account has the rows a real sign-up writes',
  async () => {
    const t = backend();
    await signIn(t, 'signUp', account('signed-up'));
    const [signUpRows] = await accountRows(t);

    await provision(t, account('player-a'));
    const rows = await accountRows(t);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(signUpRows);
  },
  PASSWORD_TEST_BUDGET_MS
);

test(
  'a provisioned account keeps its first password and signs in without creating rows, and only synthetic accounts with both hashes are accepted',
  async () => {
    const t = backend();
    const player = account('player-b');
    await provision(t, player);
    await provision(t, { email: player.email, password: account('other').password });

    const before = await rowCounts(t);
    expect((await signIn(t, 'signIn', player)).tokens?.token).toEqual(expect.any(String));
    expect(await rowCounts(t)).toEqual(before);
    await expect(provision(t, { email: 'player@example.com', password: player.password })).rejects.toThrow(
      'synthetic accounts'
    );
    await expect(
      t.mutation(internal.playTesting.provisionAccounts, {
        accounts: [{ email: account('plain').email, scrypt: player.password, sha256: passwordDigest(player.password) }],
      })
    ).rejects.toThrow('Scrypt secret');
    await expect(
      t.mutation(internal.playTesting.provisionAccounts, {
        accounts: [
          { email: account('plain').email, scrypt: await passwordSecret(player.password), sha256: player.password },
        ],
      })
    ).rejects.toThrow('SHA-256 digest');
  },
  PASSWORD_TEST_BUDGET_MS
);
