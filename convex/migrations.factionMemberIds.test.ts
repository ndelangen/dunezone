/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { legacyAssetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { ensureFactionMemberIds, FactionMemberIdSchema } from '../src/shared/factions/memberIdentity';
import { IdentifiedFactionStoredSchema } from '../src/shared/factions/schema';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const required = ['faction_member_ids_v1', 'faction_member_ids_verify_v1'];

function migrationTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  migrationsTest.register(t);
  return t;
}

async function seedFaction(t: ReturnType<typeof migrationTest>, data: unknown, is_deleted = false) {
  return t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Faction owner' });
    return ctx.db.insert('factions', {
      owner_id: ownerId,
      data,
      slug: is_deleted ? 'deleted-faction' : 'active-faction',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
      is_deleted,
      group_id: null,
    });
  });
}

function legacyFaction() {
  return {
    ...structuredClone(legacyAssetPublishingFaction),
    background: { ...legacyAssetPublishingFaction.background, image: '/image/texture/retired.jpg' },
    hero: { ...legacyAssetPublishingFaction.hero, memberId: '00000000-0000-4000-8000-000000000001', legacy: ['kept'] },
    leaders: legacyAssetPublishingFaction.leaders.map((leader) => ({ ...leader, legacy: { text: 'kept' } })),
    legacy: { nested: { text: 'Untouched\n*legacy prose' } },
  };
}

afterEach(() => vi.useRealTimers());

describe('faction member identity migration', () => {
  test('backfills existing active and deleted rosters and verifies persisted identities', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileActivity');
    aggregateTest.register(t, 'profileDiscovery');
    migrationsTest.register(t);
    const factionIds = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Faction owner' });
      return await Promise.all(
        [false, true].map((is_deleted) =>
          ctx.db.insert('factions', {
            owner_id: ownerId,
            data: structuredClone(legacyAssetPublishingFaction),
            slug: is_deleted ? 'deleted-faction' : 'active-faction',
            created_at: '2026-09-01T00:00:00.000Z',
            updated_at: '2026-09-01T00:00:00.000Z',
            is_deleted,
            group_id: null,
          })
        )
      );
    });
    await t.mutation(internal.migrations.faction_member_ids_v1, {});
    const beforeRetry = await t.run(async (ctx) => Promise.all(factionIds.map((id) => ctx.db.get('factions', id))));
    await t.mutation(internal.migrations.faction_member_ids_v1, { cursor: null });
    await t.mutation(internal.migrations.faction_member_ids_verify_v1, {});
    const afterRetry = await t.run(async (ctx) => Promise.all(factionIds.map((id) => ctx.db.get('factions', id))));
    expect(afterRetry).toEqual(beforeRetry);
    for (const faction of afterRetry) {
      expect(IdentifiedFactionStoredSchema.safeParse(faction?.data).success).toBe(true);
      expect(faction?.updated_at).toBe('2026-09-01T00:00:00.000Z');
    }
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_member_ids_v1', 'faction_member_ids_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });

  test('preserves retired assets and unknown authored fields on active and deleted factions', async () => {
    const t = migrationTest();
    const data = legacyFaction();
    const ids = await Promise.all([seedFaction(t, data), seedFaction(t, data, true)]);
    const before = await t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get('factions', id))));
    await t.mutation(internal.migrations.faction_member_ids_v1, {});
    await t.mutation(internal.migrations.faction_member_ids_verify_v1, {});
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required })).resolves.toMatchObject({ ok: true });
    const migrated = await t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get('factions', id))));
    for (const [index, row] of migrated.entries()) {
      const memberIds = [
        row!.data.hero.memberId,
        ...row!.data.leaders.map((member: { memberId: string }) => member.memberId),
      ];
      expect(memberIds.every((id) => FactionMemberIdSchema.safeParse(id).success)).toBe(true);
      expect(new Set(memberIds).size).toBe(memberIds.length);
      const withoutNewIds = {
        ...row!.data,
        leaders: row!.data.leaders.map(({ memberId: _memberId, ...member }: { memberId: string }) => member),
      };
      expect({ ...row, data: withoutNewIds }).toEqual(before[index]);
    }
    await t.mutation(internal.migrations.faction_member_ids_v1, { cursor: null });
    expect(await t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get('factions', id))))).toEqual(migrated);
  });

  test.each(['missing', 'invalid', 'duplicate', 'malformed'] as const)(
    'the verifier blocks %s roster identities',
    async (kind) => {
      const t = migrationTest();
      const data = ensureFactionMemberIds(legacyFaction());
      let invalid: unknown;
      if (kind === 'missing') {
        const { memberId: _memberId, ...hero } = data.hero;
        invalid = { ...data, hero };
      } else if (kind === 'invalid') {
        invalid = { ...data, hero: { ...data.hero, memberId: 'invalid' } };
      } else if (kind === 'duplicate') {
        invalid = { ...data, leaders: [{ ...data.leaders[0], memberId: data.hero.memberId }] };
      } else {
        invalid = { ...data, leaders: [null] };
      }
      await seedFaction(t, invalid);
      await t.mutation(internal.migrations.faction_member_ids_verify_v1, {});
      await expect(
        t.query(internal.migrations.assertReadyForNarrow, { required: ['faction_member_ids_verify_v1'] })
      ).rejects.toThrow('Narrow blocked');
    }
  );

  test('the normal deploy runner resumes a failed backfill and runs its verifier without a reset', async () => {
    vi.useFakeTimers();
    const t = migrationTest();
    const data = legacyFaction();
    const id = await seedFaction(t, { ...data, hero: { ...data.hero, memberId: 'invalid' } });
    await t.mutation(internal.migrations.runRequired, { ids: required });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.query(internal.migrations.getStatus, { ids: required })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'migrations:faction_member_ids_v1', state: 'failed', isDone: false }),
        expect.objectContaining({ name: 'migrations:faction_member_ids_verify_v1', state: 'unknown', isDone: false }),
      ])
    );
    await t.run((ctx) => ctx.db.patch('factions', id, { data }));
    await t.mutation(internal.migrations.runRequired, { ids: required });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required })).resolves.toMatchObject({ ok: true });
  });
});
