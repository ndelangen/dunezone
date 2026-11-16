/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { variantsFixture, withStartText } from './factionVariants.test.fixture';
import type { FactionData } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** The same faction authored a second time: equal content, its own leader and troop ids, one rule changed. */
function duplicateOf(data: FactionData): FactionData {
  const fresh = (index: number, kind: string) => `30000000-0000-4000-8000-${kind}${String(index).padStart(11, '0')}`;
  return withStartText(
    {
      ...data,
      factionLeader: { ...data.factionLeader, memberId: fresh(0, '1') },
      leaders: data.leaders.map((leader, index) => ({ ...leader, memberId: fresh(index + 1, '1') })),
      troops: data.troops.map((troop, index) => ({ ...troop, troopId: fresh(index, '2') })),
    },
    'Start with 20 spice.'
  );
}

async function mergeFixture() {
  const f = await variantsFixture();
  const adminId = await f.t.run(async (ctx) => await ctx.db.insert('users', { name: 'Admin', isAdmin: true }));
  const admin = f.t.withIdentity({ subject: adminId });
  await admin.mutation(api.profiles.bootstrapCurrent, {});
  const original = await f.data(f.root._id);
  const duplicate = await f.stranger.mutation(api.factions.create, { data: duplicateOf(original), group_id: null });
  const duplicateData = await f.data(duplicate._id);
  const duplicateFamilyId = (await f.row(duplicate._id)).family_id;
  const args = { faction_id: duplicate._id, family_id: f.familyId, parent_id: f.root._id };
  return { ...f, admin, original, duplicate, duplicateData, duplicateFamilyId, args };
}

describe('the admin merge tool (#2932)', () => {
  test('previews the fields that switch to the parent and that the duplicate Faction retires', async () => {
    const f = await mergeFixture();
    const preview = await f.admin.query(api.factionMerge.preview, f.args);
    expect(preview).toMatchObject({ moves: true, retiresSource: true, nameClash: true, custom: ['rules.startText'] });
    expect(preview.followed).toContain('leaders');
    expect(preview.branch).toEqual([
      { _id: f.duplicate._id, name: (await f.row(f.duplicate._id)).variant_name, isDeleted: false, changesIds: true },
    ]);
  });

  test('merges the duplicate under the parent with the parent’s ids, and rewrites references to its old ones', async () => {
    const f = await mergeFixture();
    const oldLeaderId = f.duplicateData.leaders[1]!.memberId;
    const oldTroopId = f.duplicateData.troops[0]!.troopId;
    const reference = { kind: 'faction-member', factionId: f.duplicate._id, memberId: oldLeaderId };
    const side = { factionId: f.duplicate._id, troops: [{ troopId: oldTroopId }] };
    const rulebookId = await f.t.run(async (ctx) => {
      const userId = (await ctx.db.query('users').first())!._id;
      const rulesetId = await ctx.db.insert('rulesets', {
        name: 'Rules',
        slug: 'rules',
        about: 'A ruleset whose rulebook names the duplicate faction.',
        created_at: '2026-11-16T00:00:00.000Z',
        updated_at: '2026-11-16T00:00:00.000Z',
        owner_id: userId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
      const id = await ctx.db.insert('rulebooks', {
        ruleset_id: rulesetId,
        name: 'Rules',
        name_key: 'rules',
        slug: 'rules',
        sort_order: 0,
        current_edition_number: 0,
        created_by: userId,
        created_at: '2026-11-16T00:00:00.000Z',
        updated_at: '2026-11-16T00:00:00.000Z',
        is_deleted: false,
        deleted_at: null,
      });
      await ctx.db.insert('rulebook_drafts', {
        rulebook_id: id,
        revision: 3,
        contents: { blocks: [reference, side] },
        updated_by: userId,
        updated_at: '2026-11-16T00:00:00.000Z',
      });
      return id;
    });
    const card = await f.owner.mutation(api.assets.create, {
      type: 'card-nexus',
      data: { ...GF9_NEXUS_CARDS[0]!, name: 'Duplicate nexus', factionLink: { id: f.duplicateFamilyId, slug: 'x' } },
    });

    const sourceSlug = (await f.family(f.duplicateFamilyId)).slug;
    await f.admin.mutation(api.factionMerge.attach, { ...f.args, name: 'Spice rich' });
    await f.settle();

    const merged = await f.row(f.duplicate._id);
    const data = merged.data as FactionData;
    expect(merged).toMatchObject({ family_id: f.familyId, parent_id: f.root._id, variant_name: 'Spice rich' });
    expect(merged.inherited).not.toContain('rules.startText');
    expect(data.rules.startText).toBe('Start with 20 spice.');
    expect(data.leaders.map((leader) => leader.memberId)).toEqual(f.original.leaders.map((leader) => leader.memberId));
    expect(await f.family(f.duplicateFamilyId)).toMatchObject({ is_deleted: true, merged_into: f.familyId });
    expect((await f.t.query(api.factions.pageBySlug, { slug: sourceSlug })).faction._id).toBe(f.root._id);

    const draft = await f.t.run(
      async (ctx) =>
        (await ctx.db
          .query('rulebook_drafts')
          .withIndex('by_rulebook', (q) => q.eq('rulebook_id', rulebookId))
          .first())!
    );
    expect(draft.revision).toBe(4);
    expect(draft.contents).toEqual({
      blocks: [
        { ...reference, memberId: f.original.leaders[1]!.memberId },
        { ...side, troops: [{ troopId: f.original.troops[0]!.troopId }] },
      ],
    });
    const cardRow = await f.t.run(async (ctx) => (await ctx.db.get(card.id))!);
    expect((cardRow.data as { factionLink: { id: Id<'faction_families'> } }).factionLink.id).toBe(f.familyId);
  });

  test('re-parents a variant within its Faction and refuses a parent from its own branch', async () => {
    const f = await mergeFixture();
    const first = await f.addVariant('Dreamrules');
    const second = await f.addVariant('Nightmare', first.id);
    await f.settle();
    await expect(
      f.admin.mutation(api.factionMerge.attach, {
        faction_id: first.id,
        family_id: f.familyId,
        parent_id: second.id,
        name: 'Dreamrules',
      })
    ).rejects.toThrow('cannot sit under itself');

    await f.admin.mutation(api.factionMerge.attach, {
      faction_id: second.id,
      family_id: f.familyId,
      parent_id: f.root._id,
      name: 'Nightmare',
    });
    expect((await f.row(second.id)).parent_id).toBe(f.root._id);
  });

  test('only admins may merge', async () => {
    const f = await mergeFixture();
    await expect(f.owner.query(api.factionMerge.preview, f.args)).rejects.toThrow();
    await expect(f.owner.mutation(api.factionMerge.attach, { ...f.args, name: 'Spice rich' })).rejects.toThrow();
  });
});
