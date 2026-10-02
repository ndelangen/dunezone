/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { generateKeyPairSync, randomBytes } from 'node:crypto';

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

/**
 * The settings of an isolated loopback backend with local Password sign-in and its own signing key.
 * `convex/auth.ts` reads them when a test's first function call imports it, so a test file stubs them before that call.
 */
export function stubIsolatedBackend() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
  vi.stubEnv('JWT_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
}

/** A fresh backend with the components a new account's profile writes to. */
export function accountsBackend() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

export type AccountsBackend = ReturnType<typeof accountsBackend>;

/** A synthetic account with a random password, as the runners make them. */
export function syntheticAccount(label: string) {
  return {
    email: `${label}-${randomBytes(4).toString('hex')}@example.invalid`,
    password: randomBytes(24).toString('hex'),
  };
}

export type SyntheticAccount = ReturnType<typeof syntheticAccount>;

/** One Password call through Convex Auth's real `auth:signIn` action. */
export function passwordSignIn(t: AccountsBackend, flow: 'signIn' | 'signUp', { email, password }: SyntheticAccount) {
  return t.action(api.auth.signIn, { provider: 'password', params: { flow, email, password } });
}
