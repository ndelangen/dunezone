/// <reference types="vite/client" />
import aggregateTest from '@convex-dev/aggregate/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { vi } from 'vitest';

import { applicationTriggers } from './lib/applicationTriggers';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
export function setup() {
  const t = convexTest(schema, modules);
  for (const name of ['statistics', 'profileDiscovery', 'profileActivity']) {
    aggregateTest.register(t, name);
  }
  rateLimiterTest.register(t);
  return t;
}
export async function account(
  t: ReturnType<typeof setup>,
  slug: string,
  provider: 'google' | 'discord' | 'reddit',
  admin = false
) {
  return t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    const userId = await ctx.db.insert('users', { name: slug, account_state: 'active', isAdmin: admin });
    const profileId = await ctx.db.insert('profiles', {
      user_id: userId,
      username: slug,
      slug,
      avatar_url: null,
      account_state: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const authId = await ctx.db.insert('authAccounts', { userId, provider, providerAccountId: slug });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 3_600_000 });
    await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 600_000 });
    return { userId, profileId, authId, sessionId };
  });
}
export function stubAuthEnvironment() {
  vi.useFakeTimers();
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
  vi.stubEnv('AUTH_GOOGLE_ID', 'test-google');
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'test-google-secret');
  vi.stubEnv('AUTH_DISCORD_ID', 'test-discord');
  vi.stubEnv('AUTH_DISCORD_SECRET', 'test-discord-secret');
}
export function restoreAuthEnvironment() {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
}
