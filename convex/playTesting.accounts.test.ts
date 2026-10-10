/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { passwordSecret, pbkdf2Secret } from '../scripts/lib/synthetic-accounts';
import { internal } from './_generated/api';
import type { AccountsBackend, SyntheticAccount } from './syntheticAccounts.test.fixture';
import {
  accountsBackend,
  passwordSignIn,
  stubIsolatedBackend,
  syntheticAccount,
} from './syntheticAccounts.test.fixture';

beforeEach(() => {
  /* Month-long auth expiry uses the test clock rather than Node's bounded timers. */
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  stubIsolatedBackend();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/*
 * Password hashes and checks each password with Lucia's Scrypt, written in JavaScript, and coverage-v8 counts every block of its loop.
 * One Scrypt took about 0.1 s without coverage and 1 s with it on an idle Mac, and 2.9 to 3.4 s in CI's coverage run, which runs test files in parallel.
 * Its loop awaits only microtasks, so no timer fires until it finishes: a slow Scrypt fails as a test timeout, and the `auth:store` lines Vitest prints above it show which Password call it was.
 * So each test makes one Password call, and PASSWORD_TEST_BUDGET_MS covers it about four times over.
 */
const PASSWORD_TEST_BUDGET_MS = 15_000;

async function provision(t: AccountsBackend, { email, password }: SyntheticAccount) {
  await t.mutation(internal.playTesting.provisionAccounts, {
    accounts: [{ email, scrypt: await passwordSecret(password), pbkdf2: pbkdf2Secret(password) }],
  });
}

/** Drops the fields that differ between any two accounts: ids, times, emails, slugs and secrets. */
function shared(row: object, differing: string[]) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !['_id', '_creationTime', ...differing].includes(key))
  );
}

/** Each account's rows as Password's sign-up leaves them, with the fields every account has its own value for dropped. */
async function accountRows(t: AccountsBackend) {
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

async function rowCounts(t: AccountsBackend) {
  return await t.run(async (ctx) => ({
    users: (await ctx.db.query('users').collect()).length,
    authAccounts: (await ctx.db.query('authAccounts').collect()).length,
    profiles: (await ctx.db.query('profiles').collect()).length,
  }));
}

test(
  'a provisioned account has the rows a real sign-up writes',
  async () => {
    const t = accountsBackend();
    await passwordSignIn(t, 'signUp', syntheticAccount('signed-up'));
    const [signUpRows] = await accountRows(t);

    await provision(t, syntheticAccount('player-a'));
    const rows = await accountRows(t);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(signUpRows);
  },
  PASSWORD_TEST_BUDGET_MS
);

test(
  'a provisioned account keeps its first password and signs in without creating rows, and only synthetic accounts with both hashes are accepted',
  async () => {
    const t = accountsBackend();
    const player = syntheticAccount('player-b');
    await provision(t, player);
    await provision(t, { email: player.email, password: syntheticAccount('other').password });

    const before = await rowCounts(t);
    expect((await passwordSignIn(t, 'signIn', player)).tokens?.token).toEqual(expect.any(String));
    expect(await rowCounts(t)).toEqual(before);
    await expect(provision(t, { email: 'player@example.com', password: player.password })).rejects.toThrow(
      'synthetic accounts'
    );
    await expect(
      t.mutation(internal.playTesting.provisionAccounts, {
        accounts: [
          { email: syntheticAccount('plain').email, scrypt: player.password, pbkdf2: pbkdf2Secret(player.password) },
        ],
      })
    ).rejects.toThrow('Scrypt secret');
    await expect(
      t.mutation(internal.playTesting.provisionAccounts, {
        accounts: [
          {
            email: syntheticAccount('plain').email,
            scrypt: await passwordSecret(player.password),
            pbkdf2: player.password,
          },
        ],
      })
    ).rejects.toThrow('PBKDF2 secret');
  },
  PASSWORD_TEST_BUDGET_MS
);
