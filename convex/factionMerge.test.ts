/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { createRulebookStarterContents } from '../src/shared/rulebooks/fixtures';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { variantsFixture, withStartText } from './factionVariants.test.fixture';
import type { FactionData } from './factionVariants.test.fixture';
import { recordFormerSlug } from './lib/formerSlugs';
import { rulebookDraftContentsHash, rulebookEditionContentsHash } from './lib/rulebookEditionContents';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const NOW = '2026-11-16T00:00:00.000Z';

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

/** Valid Rulebook Contents whose first page holds an illustration of `source`, so the hashes of a rewrite are real ones. */
function contentsIllustrating(source: { factionId: string; memberId: string }): RulebookContentsV1 {
  const contents = createRulebookStarterContents();
  const page = contents.pagesById[contents.pageOrder[0]!]!;
  const region = Object.keys(page.blockOrderByRegion)[0] as keyof typeof page.blockOrderByRegion;
  (page.blocksById as Record<string, unknown>).ZZZZ = {
    id: 'ZZZZ',
    kind: 'referenced-illustration',
    source: { kind: 'faction-member', ...source },
    caption: 'The duplicate’s leader',
  };
  (page.blockOrderByRegion[region] as string[]).push('ZZZZ');
  return contents;
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
  const place = { faction_id: duplicate._id, family_id: f.familyId, parent_id: f.root._id };
  const args = { ...place, name: 'Spice rich' };
  /** A Rulebook whose draft and one Edition hold `contents`. */
  const rulebookWith = (contents: unknown) =>
    f.t.run(async (ctx) => {
      const rulesetId = await ctx.db.insert('rulesets', {
        name: 'Rules',
        slug: 'rules',
        about: 'A ruleset whose rulebook names the duplicate faction.',
        created_at: NOW,
        updated_at: NOW,
        owner_id: adminId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
      const rulebookId = await ctx.db.insert('rulebooks', {
        ruleset_id: rulesetId,
        name: 'Rules',
        name_key: 'rules',
        slug: 'rules',
        sort_order: 0,
        current_edition_number: 1,
        created_by: adminId,
        created_at: NOW,
        updated_at: NOW,
        is_deleted: false,
        deleted_at: null,
      });
      const draftId = await ctx.db.insert('rulebook_drafts', {
        rulebook_id: rulebookId,
        revision: 3,
        contents,
        contents_hash: 'v1:before-the-merge',
        updated_by: adminId,
        updated_at: NOW,
      });
      const editionId = await ctx.db.insert('rulebook_editions', {
        rulebook_id: rulebookId,
        edition_number: 1,
        contents_hash: 'v1:before-the-merge',
        created_by: adminId,
        created_at: NOW,
      });
      const contentsId = await ctx.db.insert('rulebook_edition_contents', { edition_id: editionId, contents });
      return { draftId, editionId, contentsId };
    });
  return { ...f, admin, original, duplicate, duplicateData, duplicateFamilyId, place, args, rulebookWith };
}

describe('the admin merge tool (#2932)', () => {
  test('previews the fields that switch to the parent, the references it rewrites and that the duplicate Faction retires', async () => {
    const f = await mergeFixture();
    const reference = { factionId: f.duplicate._id, memberId: f.duplicateData.leaders[0]!.memberId };
    await f.rulebookWith({ blocks: [reference, reference] });

    const preview = await f.admin.query(api.factionMerge.preview, f.place);
    expect(preview.custom).toEqual(['rules.startText']);
    expect(preview.followed).toContain('leaders');
    /* The preview takes no name, so it speaks of the name the variant has now, which the kept Faction's first variant shares. */
    const current = (await f.row(f.duplicate._id)).variant_name;
    expect(preview.branch).toEqual([
      { _id: f.duplicate._id, name: current, isDeleted: false, changesIds: true, nameClash: true },
    ]);
    await expect(f.admin.mutation(api.factionMerge.attach, { ...f.args, name: current })).rejects.toThrow(
      /already has a variant called/
    );
    for (const documents of ['drafts', 'editions'] as const) {
      const found = await f.admin.query(api.factionMerge.referencePreview, {
        ...f.args,
        documents,
        paginationOpts: { cursor: null, numItems: 10 },
      });
      expect(found.page).toEqual([
        { rulebookName: 'Rules', edition: documents === 'drafts' ? null : 1, references: 2 },
      ]);
    }
  });

  test('merges the duplicate under the parent with the parent’s ids, and rewrites references to its old ones', async () => {
    const f = await mergeFixture();
    const reference = {
      kind: 'faction-member',
      factionId: f.duplicate._id,
      memberId: f.duplicateData.leaders[1]!.memberId,
    };
    const side = { factionId: f.duplicate._id, troops: [{ troopId: f.duplicateData.troops[0]!.troopId }] };
    const stored = await f.rulebookWith({ blocks: [reference, side] });
    const card = await f.owner.mutation(api.assets.create, {
      type: 'card-nexus',
      data: { ...GF9_NEXUS_CARDS[0]!, name: 'Duplicate nexus', factionLink: { id: f.duplicateFamilyId, slug: 'x' } },
    });
    const sourceSlug = (await f.family(f.duplicateFamilyId)).slug;

    await f.admin.mutation(api.factionMerge.attach, f.args);
    await f.settle();

    const merged = await f.row(f.duplicate._id);
    const data = merged.data as FactionData;
    expect(merged).toMatchObject({ family_id: f.familyId, parent_id: f.root._id, variant_name: 'Spice rich' });
    expect(merged.inherited).not.toContain('rules.startText');
    expect(data.rules.startText).toBe('Start with 20 spice.');
    expect(data.leaders.map((leader) => leader.memberId)).toEqual(f.original.leaders.map((leader) => leader.memberId));
    expect(await f.family(f.duplicateFamilyId)).toMatchObject({ is_deleted: true, merged_into: f.familyId });
    expect((await f.t.query(api.factions.pageBySlug, { slug: sourceSlug })).faction._id).toBe(f.root._id);

    const rewritten = {
      blocks: [
        { ...reference, memberId: f.original.leaders[1]!.memberId },
        { ...side, troops: [{ troopId: f.original.troops[0]!.troopId }] },
      ],
    };
    const [draft, edition, contents] = await f.t.run(
      async (ctx) =>
        [
          (await ctx.db.get(stored.draftId))!,
          (await ctx.db.get(stored.editionId))!,
          (await ctx.db.get(stored.contentsId))!,
        ] as const
    );
    expect(draft).toMatchObject({ revision: 4, contents: rewritten });
    expect(draft.contents_hash).toBe(rulebookDraftContentsHash(rewritten));
    expect(contents.contents).toEqual(rewritten);
    expect(edition.contents_hash).toBe(rulebookEditionContentsHash(rewritten));

    const cardRow = await f.t.run(async (ctx) => (await ctx.db.get(card.id))!);
    expect((cardRow.data as { factionLink: { id: Id<'faction_families'> } }).factionLink.id).toBe(f.familyId);
  });

  test('rewritten Contents get fresh hashes that match them', async () => {
    const f = await mergeFixture();
    const contents = contentsIllustrating({
      factionId: f.duplicate._id,
      memberId: f.duplicateData.leaders[0]!.memberId,
    });
    expect(rulebookDraftContentsHash(contents)).toBeDefined();
    const stored = await f.rulebookWith(contents);

    await f.admin.mutation(api.factionMerge.attach, f.args);
    await f.settle();

    const rewritten = contentsIllustrating({ factionId: f.duplicate._id, memberId: f.original.leaders[0]!.memberId });
    const [draft, edition] = await f.t.run(
      async (ctx) => [(await ctx.db.get(stored.draftId))!, (await ctx.db.get(stored.editionId))!] as const
    );
    expect(draft.contents).toEqual(rewritten);
    expect(draft.contents_hash).toBeDefined();
    expect(draft.contents_hash).toBe(rulebookDraftContentsHash(rewritten));
    expect(edition.contents_hash).toBeDefined();
    expect(edition.contents_hash).toBe(rulebookEditionContentsHash(rewritten));
  });

  test('refuses a name that another variant of the moving branch keeps', async () => {
    const f = await mergeFixture();
    await f.stranger.mutation(api.factionVariants.create, {
      faction_id: f.duplicate._id,
      name: 'Dreamrules',
      group_id: null,
      parent_id: f.duplicate._id,
    });
    await f.settle();
    await expect(f.admin.mutation(api.factionMerge.attach, { ...f.args, name: 'Dreamrules' })).rejects.toThrow(
      'already has a variant'
    );
  });

  test('a former address of a Faction merged away leads to the Faction it joined', async () => {
    const f = await mergeFixture();
    const formerSlug = (await f.family(f.duplicateFamilyId)).slug;
    await f.t.run(async (ctx) => {
      await ctx.db.patch('faction_families', f.duplicateFamilyId, { slug: 'renamed-duplicate' });
      await recordFormerSlug(ctx, {
        kind: 'faction_family',
        scope: '',
        slug: formerSlug,
        record_id: f.duplicateFamilyId,
      });
    });
    await f.admin.mutation(api.factionMerge.attach, f.args);
    await f.settle();
    expect(await f.t.query(api.formerAddresses.resolve, { address: { kind: 'faction', slug: formerSlug } })).toBe(
      `/factions/${(await f.row(f.root._id)).slug}`
    );
  });

  test('a variant below the duplicate that follows its leaders moves along and has its references rewritten too', async () => {
    const f = await mergeFixture();
    const child = await f.stranger.mutation(api.factionVariants.create, {
      faction_id: f.duplicate._id,
      name: 'Dreamrules',
      group_id: null,
      parent_id: f.duplicate._id,
    });
    await f.settle();
    const childReference = { factionId: child.id, memberId: f.duplicateData.leaders[2]!.memberId };
    const stored = await f.rulebookWith({ blocks: [childReference] });

    await f.admin.mutation(api.factionMerge.attach, f.args);
    await f.settle();

    expect(await f.row(child.id)).toMatchObject({ family_id: f.familyId, parent_id: f.duplicate._id });
    expect((await f.data(child.id)).leaders[2]!.memberId).toBe(f.original.leaders[2]!.memberId);
    const draft = await f.t.run(async (ctx) => (await ctx.db.get(stored.draftId))!);
    expect(draft.contents).toEqual({ blocks: [{ ...childReference, memberId: f.original.leaders[2]!.memberId }] });
  });

  test('refuses a name a variant of the faction already has', async () => {
    const f = await mergeFixture();
    const name = (await f.row(f.root._id)).variant_name;
    await expect(f.admin.mutation(api.factionMerge.attach, { ...f.args, name })).rejects.toThrow(
      'already has a variant'
    );
  });

  test('merges without a parent, keeping every field and id its own', async () => {
    const f = await mergeFixture();
    await f.admin.mutation(api.factionMerge.attach, { ...f.args, parent_id: null });
    await f.settle();
    const merged = await f.row(f.duplicate._id);
    expect(merged.parent_id).toBeUndefined();
    expect((merged.data as FactionData).leaders).toEqual(f.duplicateData.leaders);
  });

  test('re-parents a variant within its Faction and refuses a parent from its own branch', async () => {
    const f = await mergeFixture();
    const first = await f.addVariant('Dreamrules');
    const second = await f.addVariant('Nightmare', first.id);
    await f.settle();
    await expect(
      f.admin.mutation(api.factionMerge.attach, { faction_id: first.id, family_id: f.familyId, parent_id: second.id })
    ).rejects.toThrow('cannot sit under itself');

    await f.admin.mutation(api.factionMerge.attach, {
      faction_id: second.id,
      family_id: f.familyId,
      parent_id: f.root._id,
    });
    await f.settle();
    const moved = await f.row(second.id);
    expect(moved).toMatchObject({ parent_id: f.root._id, variant_name: 'Nightmare' });
    expect(moved.inherited).toContain('leaders');
    expect((moved.data as FactionData).leaders).toEqual(f.original.leaders);
  });

  test('lists a Faction’s variants with their parents, the deleted ones too, to admins only', async () => {
    const f = await mergeFixture();
    const child = await f.addVariant('Dreamrules', f.root._id);
    const dropped = await f.addVariant('First draft', child.id);
    await f.t.run(async (ctx) => await ctx.db.patch(dropped.id, { is_deleted: true }));

    const listed = await f.admin.query(api.factionMerge.variants, { faction_id: child.id });
    expect(listed).toMatchObject({ familyId: f.familyId, defaultVariantId: f.root._id });
    expect(listed?.name).toBe((await f.data(f.root._id)).name);
    expect(listed?.variants.map(({ _id, parentId, isDeleted }) => [_id, parentId, isDeleted])).toEqual([
      [f.root._id, null, false],
      [child.id, f.root._id, false],
      [dropped.id, child.id, true],
    ]);
    expect(listed?.variants.slice(1).map(({ slug }) => slug)).toEqual(['dreamrules', 'first-draft']);
    await expect(f.stranger.query(api.factionMerge.variants, { faction_id: child.id })).rejects.toThrow();
  });

  test('only admins may merge', async () => {
    const f = await mergeFixture();
    await expect(f.owner.query(api.factionMerge.preview, f.place)).rejects.toThrow();
    await expect(f.owner.mutation(api.factionMerge.attach, f.args)).rejects.toThrow();
  });
});
