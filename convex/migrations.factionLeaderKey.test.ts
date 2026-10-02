/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import { factionTest, insertStoredFactions, storedFactionData } from './factions.test.fixture';

const required = ['faction_leader_key_v1', 'faction_leader_key_verify_v1'];
const legacyLeader = { name: 'Duke Leto', image: '/image/leader/atreides/duke-leto.png' };
const renamedLeader = { name: 'Paul Atreides', image: '/image/leader/atreides/duke-leto.png' };

describe('faction leader key migration', () => {
  test('copies `hero` to `leader` once, keeping the old key, every other field and the edit timestamp', async () => {
    const t = factionTest();
    const ids = await insertStoredFactions(t, [
      { slug: 'legacy', data: { retiredField: 'kept', hero: legacyLeader } },
      { slug: 'deleted', data: { hero: legacyLeader }, isDeleted: true },
      { slug: 'both', data: { hero: legacyLeader, leader: renamedLeader } },
      { slug: 'current', data: { leader: renamedLeader } },
    ]);
    const before = await storedFactionData(t, ids);

    await t.mutation(internal.migrations.faction_leader_key_v1, {});
    const first = await storedFactionData(t, ids);
    await t.mutation(internal.migrations.faction_leader_key_v1, { reset: true });
    await t.mutation(internal.migrations.faction_leader_key_verify_v1, {});
    const second = await storedFactionData(t, ids);

    const [legacy, deleted, both, current] = first;
    expect(legacy!.data).toEqual({ ...before[0]!.data, leader: legacyLeader });
    expect(legacy!.updated_at).toBe(before[0]!.updated_at);
    expect(deleted!.data).toEqual({ ...before[1]!.data, leader: legacyLeader });
    expect(both!.data).toEqual(before[2]!.data);
    expect(current!.data).toEqual(before[3]!.data);
    expect(second.map((row) => row.data)).toEqual(first.map((row) => row.data));
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required })).resolves.toMatchObject({
      ok: true,
    });
  });

  test('verification refuses a faction that still has only `hero`', async () => {
    const t = factionTest();
    await insertStoredFactions(t, [{ slug: 'unmigrated', data: { hero: legacyLeader } }]);

    await t.mutation(internal.migrations.faction_leader_key_verify_v1, {});
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['faction_leader_key_verify_v1'] })
    ).rejects.toThrow(/faction_leader_key_verify_v1\(failed/);
  });
});
