/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { publisherCaptureSnapshotSchema } from '../src/shared/asset-publishing/publisher-snapshot';
import { GF9_LEADER_SKILLS } from '../src/shared/assets/gf9LeaderSkills';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('leader skills save, publish their two abilities, and reopen with author access', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const outsiderId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
  const owner = t.withIdentity({ subject: ownerId });
  const card = GF9_LEADER_SKILLS[5]!;
  await expect(t.mutation(api.assets.create, { type: 'card-leaderability', data: card })).rejects.toThrow(
    'Not authenticated'
  );
  const created = await owner.mutation(api.assets.create, { type: 'card-leaderability', data: card });
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) =>
        q.eq('asset_type', 'card-leaderability').eq('asset_id', created.id)
      )
      .unique()
  );
  expect(
    publisherCaptureSnapshotSchema.parse({
      ok: true,
      assetType: 'card-leaderability',
      payload: job!.asset_data,
      payloadHash: 'a'.repeat(64),
    }).payload
  ).toEqual({ assetId: created.id, slug: created.slug, card });
  await expect(
    t.withIdentity({ subject: outsiderId }).mutation(api.assets.update, { id: created.id, data: card })
  ).rejects.toThrow('Not authorized');
  const updated = { ...card, battleText: 'Add +4 to this leader disc.' };
  await owner.mutation(api.assets.update, { id: created.id, data: updated });
  expect((await t.query(api.assets.getPage, { type: 'card-leaderability', slug: created.slug }))?.asset.data).toEqual(
    updated
  );
  for (const change of [
    { battleText: '*unclosed' },
    { textSize: 4 },
    { generalText: 'x'.repeat(601) },
    { layers: [] },
  ]) {
    await expect(
      owner.mutation(api.assets.update, { id: created.id, data: { ...updated, ...change } })
    ).rejects.toThrow();
  }
});

test('GF9 installation creates exactly fourteen cards and one deck and preserves edits on repeat', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Stock owner', isAdmin: true }));
  const first = await t.mutation(internal.assets.seedGF9LeaderSkills, { ownerId });
  expect(first.created).toBe(15);
  expect(first.cardIds).toHaveLength(14);
  const deck = await t.query(api.assets.getPage, { type: 'deck', slug: 'gf9-leader-skill-deck' });
  expect(deck?.members).toHaveLength(14);
  expect(deck?.members?.map((row) => ({ name: row.member.name, count: row.count }))).toEqual(
    GF9_LEADER_SKILLS.map((card) => ({ name: card.name, count: 1 }))
  );
  const owner = t.withIdentity({ subject: ownerId });
  const edited = {
    ...GF9_LEADER_SKILLS[0]!,
    name: 'Renamed Bureaucrat',
    battleText: 'An authored replacement ability.',
  };
  await owner.mutation(api.assets.update, { id: first.cardIds[0]!, data: edited });
  const second = await t.mutation(internal.assets.seedGF9LeaderSkills, { ownerId });
  expect(second).toEqual({ ...first, created: 0 });
  expect((await t.query(api.assets.getPage, { type: 'deck', slug: 'gf9-leader-skill-deck' }))?.members).toHaveLength(
    14
  );
  expect(
    (await t.query(api.assets.getPage, { type: 'card-leaderability', slug: 'renamed-bureaucrat' }))?.asset.data
  ).toEqual(edited);
});

test('GF9 installation refuses occupied stock addresses and rolls back the whole set', async () => {
  const t = convexTest(schema, modules);
  const adminId = await t.run((ctx) => ctx.db.insert('users', { name: 'Stock owner', isAdmin: true }));
  const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
  await t
    .withIdentity({ subject: otherId })
    .mutation(api.assets.create, { type: 'card-leaderability', data: GF9_LEADER_SKILLS[5]! });
  await expect(t.mutation(internal.assets.seedGF9LeaderSkills, { ownerId: adminId })).rejects.toThrow(
    'already reserved'
  );
  expect(await t.run((ctx) => ctx.db.query('assets').collect())).toHaveLength(1);
  await expect(t.mutation(internal.assets.seedGF9LeaderSkills, { ownerId: otherId })).rejects.toThrow(
    'active administrator'
  );
});

test('GF9 installation refuses an unrelated same-owner card at a stock address', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { isAdmin: true }));
  await t
    .withIdentity({ subject: ownerId })
    .mutation(api.assets.create, { type: 'card-leaderability', data: GF9_LEADER_SKILLS[0]! });
  await expect(t.mutation(internal.assets.seedGF9LeaderSkills, { ownerId })).rejects.toThrow('already reserved');
  expect(await t.run((ctx) => ctx.db.query('assets').collect())).toHaveLength(1);
});

test('GF9 presentation refresh repairs untouched cards once and preserves edits, transfers and deletion', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Stock owner', isAdmin: true }));
  const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
  const installed = await t.mutation(internal.assets.seedGF9LeaderSkills, { ownerId });
  await t.run(async (ctx) => {
    await Promise.all(
      installed.cardIds.map((id, index) => {
        const card = GF9_LEADER_SKILLS[index]!;
        return ctx.db.patch('assets', id, {
          data: {
            ...card,
            textSize: 32,
            decals: card.decals.map((decal) => ({
              ...decal,
              id: card.name === 'Smuggler' ? '/vector/decal/smuggler-multicolor.svg' : decal.id,
            })),
          },
        });
      })
    );
    await ctx.db.patch('assets', installed.cardIds[1]!, { owner_id: otherId });
    await ctx.db.patch('assets', installed.cardIds[2]!, { is_deleted: true });
  });
  const edited = { ...GF9_LEADER_SKILLS[0]!, textSize: 32, battleText: 'An authored replacement ability.' };
  await t.withIdentity({ subject: ownerId }).mutation(api.assets.update, { id: installed.cardIds[0]!, data: edited });
  expect(await t.mutation(internal.assets.refreshGF9LeaderSkillPresentationV2, {})).toEqual(installed.cardIds.slice(3));
  const cards = await t.run((ctx) => Promise.all(installed.cardIds.map((id) => ctx.db.get('assets', id))));
  expect(cards[0]?.data).toEqual(edited);
  expect(cards[1]?.data.textSize).toBe(32);
  expect(cards[2]?.data.textSize).toBe(32);
  expect(cards.slice(3).map((card) => card?.data)).toEqual(GF9_LEADER_SKILLS.slice(3));
  const smugglerJob = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) =>
        q.eq('asset_type', 'card-leaderability').eq('asset_id', installed.cardIds[9]!)
      )
      .unique()
  );
  expect(smugglerJob?.asset_data.card).toEqual(GF9_LEADER_SKILLS[9]);
  expect(await t.mutation(internal.assets.refreshGF9LeaderSkillPresentationV2, {})).toEqual([]);
});
