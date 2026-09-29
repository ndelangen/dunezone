/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { CanonicalFactionStoredSchema, SUPPORTING_LEADER_LIMIT } from '../src/shared/factions/schema';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('the supporting-leader cap on faction saves (#644)', () => {
  test('a save refuses more than ten supporting leaders, while a stored faction over the cap still reads', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileActivity');
    aggregateTest.register(t, 'profileDiscovery');
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Leader cap proof user' }));
    const asUser = t.withIdentity({ subject: userId });
    const { memberId: _memberId, ...template } = assetPublishingFaction.leaders[0]!;
    const roster = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...template, name: `Leader ${index + 1}` }));

    await expect(
      asUser.mutation(api.factions.create, {
        data: {
          ...structuredClone(assetPublishingFaction),
          name: 'Eleven Leaders',
          leaders: roster(SUPPORTING_LEADER_LIMIT + 1),
        },
        group_id: null,
      })
    ).rejects.toThrow(`leaders: A faction can have at most ${SUPPORTING_LEADER_LIMIT} supporting leaders.`);
    const created = await asUser.mutation(api.factions.create, {
      data: {
        ...structuredClone(assetPublishingFaction),
        name: 'Ten Leaders',
        leaders: roster(SUPPORTING_LEADER_LIMIT),
      },
      group_id: null,
    });
    expect(created.data.leaders).toHaveLength(SUPPORTING_LEADER_LIMIT);

    /* A row written before the cap existed keeps loading; only saving it again asks for a trim. */
    const eleven = [...created.data.leaders, { ...template, name: 'One too many', memberId: crypto.randomUUID() }];
    await t.run(async (ctx) => {
      const row = await ctx.db.get(created._id);
      await ctx.db.patch(created._id, { data: { ...row!.data, leaders: eleven } });
    });
    const stored = CanonicalFactionStoredSchema.parse(
      (await t.run(async (ctx) => await ctx.db.get(created._id)))!.data
    );
    expect(stored.leaders).toHaveLength(SUPPORTING_LEADER_LIMIT + 1);
    await expect(
      asUser.mutation(api.factions.update, { id: created._id, data: { ...stored, name: 'Still Eleven' } })
    ).rejects.toThrow(`at most ${SUPPORTING_LEADER_LIMIT} supporting leaders`);
  });
});
