/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { passwordSecret, pbkdf2Secret } from '../scripts/lib/synthetic-accounts';
import { internal } from './_generated/api';
import { checksPbkdf2Passwords, pbkdf2PasswordCrypto } from './lib/syntheticPasswords';
import type { AccountsBackend } from './syntheticAccounts.test.fixture';
import {
  accountsBackend,
  passwordSignIn,
  stubIsolatedBackend,
  syntheticAccount,
} from './syntheticAccounts.test.fixture';

/* The hosted-play launcher's backend. */
beforeEach(() => {
  /* Month-long auth expiry uses the test clock rather than Node's bounded timers. */
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  stubIsolatedBackend();
  vi.stubEnv('PLAY_TEST_PASSWORD_HASH', 'pbkdf2');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/**
 * Production keeps E2E_LOCAL_AUTH off, so it registers no Password provider, and these cases cover the guard behind that.
 * Each leaves one condition unmet, and the hosted URLs stand for any deployment Convex hosts.
 */
describe('which backends check PBKDF2', () => {
  test('an isolated loopback backend with the variable does', () => {
    expect(checksPbkdf2Passwords()).toBe(true);
    expect(pbkdf2PasswordCrypto()).toBeDefined();
  });

  test.each([
    ['PLAY_TEST_PASSWORD_HASH', undefined],
    ['PLAY_TEST_PASSWORD_HASH', 'scrypt'],
    ['IS_TEST', undefined],
    ['E2E_LOCAL_AUTH', undefined],
    ['CONVEX_CLOUD_URL', 'https://production.convex.cloud'],
    ['SITE_URL', 'https://dune.zone'],
  ])('a backend with %s set to %s keeps Scrypt', (key, value) => {
    vi.stubEnv(key, value);
    expect(checksPbkdf2Passwords()).toBe(false);
    expect(pbkdf2PasswordCrypto()).toBeUndefined();
  });
});

async function storedSecret(t: AccountsBackend, email: string) {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) => q.eq('provider', 'password').eq('providerAccountId', email))
      .unique();
    return row?.secret;
  });
}

/* The secret is made in Node by the runner's own helper and checked by Convex Auth's real Password sign-in. */
test('a provisioned account keeps the PBKDF2 secret the runner made, signs in with its password and is refused with another', async () => {
  const t = accountsBackend();
  const player = syntheticAccount('player-a');
  await t.mutation(internal.playTesting.provisionAccounts, {
    accounts: [
      { email: player.email, scrypt: await passwordSecret(player.password), pbkdf2: pbkdf2Secret(player.password) },
    ],
  });

  expect(await storedSecret(t, player.email)).toMatch(/^pbkdf2-sha256:[a-f0-9]{32}:[a-f0-9]{64}$/);
  expect((await passwordSignIn(t, 'signIn', player)).tokens?.token).toEqual(expect.any(String));
  await expect(
    passwordSignIn(t, 'signIn', { ...player, password: syntheticAccount('other').password })
  ).rejects.toThrow('InvalidSecret');
});

test('a sign-up stores a PBKDF2 secret that signs in again', async () => {
  const t = accountsBackend();
  const visitor = syntheticAccount('visitor');
  await passwordSignIn(t, 'signUp', visitor);

  expect(await storedSecret(t, visitor.email)).toMatch(/^pbkdf2-sha256:[a-f0-9]{32}:[a-f0-9]{64}$/);
  expect((await passwordSignIn(t, 'signIn', visitor)).tokens?.token).toEqual(expect.any(String));
});
