/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { generateKeyPairSync, randomBytes } from 'node:crypto';

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { passwordSecret, pbkdf2Secret } from '../scripts/lib/synthetic-accounts';
import { api, internal } from './_generated/api';
import { checksPbkdf2Passwords, pbkdf2PasswordCrypto } from './lib/syntheticPasswords';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

/* The hosted-play launcher's backend; `convex/auth.ts` reads these when the first function call imports it. */
beforeEach(() => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('PLAY_TEST_PASSWORD_HASH', 'pbkdf2');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
  vi.stubEnv('JWT_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
});
afterEach(() => {
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

async function storedSecret(t: ReturnType<typeof backend>, email: string) {
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
  const t = backend();
  const player = account('player-a');
  await t.mutation(internal.playTesting.provisionAccounts, {
    accounts: [
      { email: player.email, scrypt: await passwordSecret(player.password), pbkdf2: pbkdf2Secret(player.password) },
    ],
  });

  expect(await storedSecret(t, player.email)).toMatch(/^pbkdf2-sha256:[a-f0-9]{32}:[a-f0-9]{64}$/);
  expect((await signIn(t, 'signIn', player)).tokens?.token).toEqual(expect.any(String));
  await expect(signIn(t, 'signIn', { ...player, password: account('other').password })).rejects.toThrow(
    'InvalidSecret'
  );
});

test('a sign-up stores a PBKDF2 secret that signs in again', async () => {
  const t = backend();
  const visitor = account('visitor');
  await signIn(t, 'signUp', visitor);

  expect(await storedSecret(t, visitor.email)).toMatch(/^pbkdf2-sha256:[a-f0-9]{32}:[a-f0-9]{64}$/);
  expect((await signIn(t, 'signIn', visitor)).tokens?.token).toEqual(expect.any(String));
});
