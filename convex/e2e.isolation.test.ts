/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

beforeEach(() => {
  vi.stubEnv('IS_TEST', 'true');
  vi.stubEnv('E2E_LOCAL_AUTH', 'true');
  vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('SITE_URL', 'http://127.0.0.1:3000');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('E2E environment isolation', () => {
  test.each([
    ['IS_TEST', 'false'],
    ['E2E_LOCAL_AUTH', 'false'],
    ['CONVEX_CLOUD_URL', 'https://production.convex.cloud'],
    ['SITE_URL', 'https://dune.zone'],
  ])('refuses every helper when %s is not isolated', async (key, value) => {
    vi.stubEnv(key, value);
    const t = convexTest(schema, modules);
    const counter = await t.run((ctx) => ctx.db.insert('counters', { key: 'security-sentinel', value: 1 }));
    await expect(t.query(api.e2e.status, {})).rejects.toThrow('isolated loopback');
    await expect(t.mutation(api.e2e.clearAll, {})).rejects.toThrow('isolated loopback');
    await expect(t.mutation(api.e2e.seedBaseline, {})).rejects.toThrow('isolated loopback');
    await expect(t.mutation(api.e2e.softDeleteGroupBySlug, { slug: 'a-group' })).rejects.toThrow('isolated loopback');
    await expect(
      t.mutation(api.e2e.seedRulebookEditor, {
        ownerEmail: 'owner@example.com',
        memberEmail: 'member@example.com',
        slug: 'a-rulebook',
        includeMember: true,
      })
    ).rejects.toThrow('isolated loopback');
    expect(await t.run((ctx) => ctx.db.get(counter))).not.toBeNull();
  });

  test('allows a disposable local backend to reset its fixtures', async () => {
    const t = convexTest(schema, modules);
    const counter = await t.run((ctx) => ctx.db.insert('counters', { key: 'security-sentinel', value: 1 }));
    expect(await t.query(api.e2e.status, {})).toMatchObject({ isTest: true });
    expect(await t.mutation(api.e2e.clearAll, {})).toEqual({ ok: true });
    expect(await t.run((ctx) => ctx.db.get(counter))).toBeNull();
  });
});
