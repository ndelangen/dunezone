/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { HOMEPAGE_LEASE_MS } from '../src/shared/homepage/protocol';
import { api, internal } from './_generated/api';
import { account, setup, stubAuthEnvironment, restoreAuthEnvironment } from './authAccount.test.fixture';
import { queueHomepageBanCutoff } from './lib/homepageBanCutoff';

beforeEach(stubAuthEnvironment);
afterEach(() => {
  restoreAuthEnvironment();
  vi.unstubAllGlobals();
});

async function bannedAccount() {
  const t = setup();
  const user = await account(t, 'homepage-ban', 'discord');
  const operationId = await t.run(async (ctx) => {
    const now = new Date().toISOString();
    const operationId = await ctx.db.insert('account_deletion_operations', {
      kind: 'ban',
      source_user_id: user.userId,
      source_profile_id: user.profileId,
      replacement_user_id: null,
      state: 'running',
      phase: 'snapshotting',
      snapshot_kind: 'group',
      snapshot_cursor: null,
      retry_count: 0,
      error: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    });
    await ctx.db.patch(user.userId, { account_state: 'banned', account_deletion_operation_id: operationId });
    await queueHomepageBanCutoff(ctx, operationId);
    return operationId;
  });
  const operation = await t.run((ctx) => ctx.db.get(operationId));
  return { t, user, operationId, token: operation!.homepage_cutoff_token! };
}

test('only the ban capability resolves an account, and unban preserves the immutable cutoff until delivery', async () => {
  const { t, user, operationId, token } = await bannedAccount();
  expect(await t.query(api.homepageBanCutoff.authorize, { operationId, token: '0'.repeat(64) })).toBeNull();
  expect(await t.query(api.homepageBanCutoff.authorize, { operationId: 'unknown', token })).toBeNull();
  expect(await t.query(api.homepageBanCutoff.authorize, { operationId, token })).toEqual({
    userKey: user.userId,
    through: Date.now(),
    expiresAt: Date.now() + HOMEPAGE_LEASE_MS + 60_000,
  });
  await t.run((ctx) => ctx.db.patch(user.userId, { account_state: 'active' }));
  expect(await t.query(api.homepageBanCutoff.authorize, { operationId, token })).toEqual({
    userKey: user.userId,
    through: Date.now(),
    expiresAt: Date.now() + HOMEPAGE_LEASE_MS + 60_000,
  });
});

test('the next retry is durable before delivery and stops after the old leases expire', async () => {
  const { t, operationId, token } = await bannedAccount();
  await t.mutation(internal.homepageBanCutoff.attempt, { operationId });
  const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
  expect(jobs.some((job) => job.name === 'homepageBanCutoff:attempt' && job.scheduledTime === Date.now() + 5000)).toBe(
    true
  );
  expect(jobs.some((job) => job.name === 'homepageBanCutoff:deliver')).toBe(true);
  vi.setSystemTime(Date.now() + HOMEPAGE_LEASE_MS + 60_001);
  await t.mutation(internal.homepageBanCutoff.attempt, { operationId });
  expect(await t.query(api.homepageBanCutoff.authorize, { operationId, token })).toBeNull();
});

test('an acknowledged Worker cutoff ends retries without placing its capability in the URL', async () => {
  const { t, operationId, token } = await bannedAccount();
  vi.stubEnv('PLAY_SERVICE_URL', 'http://127.0.0.1:8787');
  const post = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(input).toBe('http://127.0.0.1:8787/__play/homepage/account-cutoff');
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
    expect(new Headers(init?.headers).get('X-Account-Operation')).toBe(operationId);
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal('fetch', post);
  await t.action(internal.homepageBanCutoff.deliver, { operationId, token });
  expect(post).toHaveBeenCalledOnce();
  expect(await t.query(api.homepageBanCutoff.authorize, { operationId, token })).toBeNull();
});
