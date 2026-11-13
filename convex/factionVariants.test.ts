/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { INHERITABLE_FIELDS } from '../src/shared/factions/variantFields';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type FactionData = typeof assetPublishingFaction;

async function variantsFixture() {
  const t = applicationTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Faction author' }));
  const owner = t.withIdentity({ subject: ownerId });
  await owner.mutation(api.profiles.bootstrapCurrent, {});
  const strangerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Stranger' }));
  const stranger = t.withIdentity({ subject: strangerId });
  await stranger.mutation(api.profiles.bootstrapCurrent, {});

  const root = await owner.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
  const addVariant = (name: string, parentId?: Id<'factions'>) =>
    owner.mutation(api.factionVariants.create, {
      faction_id: root._id,
      name,
      group_id: null,
      ...(parentId ? { parent_id: parentId } : {}),
    });
  const row = (id: Id<'factions'>) => t.run(async (ctx) => (await ctx.db.get(id))!);
  const data = async (id: Id<'factions'>) => (await row(id)).data as FactionData;
  const save = (id: Id<'factions'>, next: FactionData, inherited?: string[]) =>
    owner.mutation(api.factions.update, { id, data: next, ...(inherited ? { inherited } : {}) });
  const settle = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, owner, stranger, root, addVariant, row, data, save, settle };
}

const withStartText = (data: FactionData, startText: string): FactionData => ({
  ...data,
  rules: { ...data.rules, startText },
});

describe('faction variants (#2927)', () => {
  test('a variant with a parent starts following it in every field, at its own address', async () => {
    const { root, addVariant, row } = await variantsFixture();
    const created = await addVariant('Dreamrules', root._id);
    const child = await row(created.id);

    expect(created.slug).toBe('atreides-dreamrules');
    expect(child).toMatchObject({
      family_id: (await row(root._id)).family_id,
      parent_id: root._id,
      variant_name: 'Dreamrules',
      variant_slug: 'dreamrules',
      inherited: [...INHERITABLE_FIELDS],
      problems: [],
    });
    expect(child.data).toEqual((await row(root._id)).data);
  });

  test('a variant without a parent is a copy with fields of its own', async () => {
    const { root, addVariant, row } = await variantsFixture();
    const created = await addVariant('Homebrew');
    const variant = await row(created.id);
    expect(variant.parent_id).toBeUndefined();
    expect(variant.inherited).toBeUndefined();
    expect(variant.data).toEqual((await row(root._id)).data);
  });

  test('only the faction’s maintainers add variants, never twice under one name, and only under a parent of the same faction', async () => {
    const { owner, stranger, root, addVariant } = await variantsFixture();
    await expect(
      stranger.mutation(api.factionVariants.create, { faction_id: root._id, name: 'Mine', group_id: null })
    ).rejects.toThrow('Not authorized');
    await addVariant('Dreamrules');
    await expect(addVariant('dreamrules!')).rejects.toThrow('already has a variant called');

    const other = await owner.mutation(api.factions.create, {
      data: { ...assetPublishingFaction, name: 'Harkonnen' },
      group_id: null,
    });
    await expect(addVariant('Crossed', other._id)).rejects.toThrow('same faction');
  });

  test('a parent’s save reaches its children and theirs, through a soft-deleted middle variant', async () => {
    const { owner, root, addVariant, data, save, settle } = await variantsFixture();
    const middle = await addVariant('Middle', root._id);
    const grandchild = await addVariant('Grandchild', middle.id);
    await owner.mutation(api.factions.softDelete, { id: middle.id });

    await save(root._id, withStartText(await data(root._id), 'Start anywhere you like.'));
    await settle();

    expect((await data(middle.id)).rules.startText).toBe('Start anywhere you like.');
    expect((await data(grandchild.id)).rules.startText).toBe('Start anywhere you like.');
  });

  test('a custom field stays the child’s own, and switching it back to the parent takes the parent’s value', async () => {
    const { root, addVariant, data, save, settle } = await variantsFixture();
    const child = await addVariant('Dreamrules', root._id);
    const custom = INHERITABLE_FIELDS.filter((field) => field !== 'rules.startText');

    await save(child.id, withStartText(await data(child.id), 'Our own start.'), custom);
    await save(root._id, withStartText(await data(root._id), 'The parent’s new start.'));
    await settle();
    expect((await data(child.id)).rules.startText).toBe('Our own start.');

    /* Whatever the draft holds for a field it follows, the parent's value is what is stored. */
    await save(child.id, withStartText(await data(child.id), 'Hidden draft text.'), [...INHERITABLE_FIELDS]);
    expect((await data(child.id)).rules.startText).toBe('The parent’s new start.');
  });

  test('a parent change that leaves the child invalid still reaches it, and its page lists the problem', async () => {
    const { root, addVariant, data, row, save, settle } = await variantsFixture();
    const child = await addVariant('Dreamrules', root._id);
    const custom = INHERITABLE_FIELDS.filter((field) => field !== 'troops');
    const parentData = await data(root._id);
    await save(
      child.id,
      { ...(await data(child.id)), troops: [{ ...parentData.troops[0], planet: 'Caladan' }] },
      custom
    );
    await save(root._id, {
      ...parentData,
      planet: [{ image: 'https://example.com/caladan.png', name: 'Caladan', description: '' }],
    });
    await settle();
    expect((await row(child.id)).problems).toEqual([]);

    await save(root._id, { ...(await data(root._id)), planet: [] });
    await settle();
    expect((await data(child.id)).planet).toEqual([]);
    expect((await row(child.id)).problems).toEqual([
      'The troop "Regular troop" names the planet "Caladan", which this variant does not have.',
    ]);
  });

  test('a shared field saved on one variant reaches every other variant of the faction', async () => {
    const { root, addVariant, data, save, settle } = await variantsFixture();
    const sibling = await addVariant('Homebrew');
    await save(sibling.id, { ...(await data(sibling.id)), themeColor: '#123456' });
    await settle();
    expect((await data(root._id)).themeColor).toBe('#123456');
  });

  test('a variant without a parent cannot follow one', async () => {
    const { root, data, save } = await variantsFixture();
    await expect(save(root._id, await data(root._id), ['leaders'])).rejects.toThrow('parent variant');
  });
});
