import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { importAll, importedFaction, packageFor, second } from './contentImports.test.fixture';

const spiceHeavy = { ...assetPublishingFaction, rules: { ...assetPublishingFaction.rules, spiceCount: 7 } };

/** A copy that leaves out its troops and spice count, which then follow its parent. */
function withoutTroopsOrSpice() {
  const { troops: _troops, ...data } = assetPublishingFaction;
  const { spiceCount: _spiceCount, ...rules } = assetPublishingFaction.rules;
  return { ...data, rules };
}

afterEach(() => {
  vi.useRealTimers();
});

/** A new variant may follow a parent variant, taking each inheritable field its copy leaves out (#2931). */
describe('a package item giving a parent', () => {
  test('follows an earlier item of the package in the fields it leaves out', async () => {
    const { t, owner, family } = await importedFaction();
    const bundle = packageFor('expansion', [
      { key: 'heavy', kind: 'faction', faction: family.slug, variantName: 'Spice heavy', data: spiceHeavy },
      {
        key: 'heavier',
        kind: 'faction',
        faction: family.slug,
        variantName: 'Spice heavier',
        parent: 'heavy',
        data: withoutTroopsOrSpice(),
      },
    ]);

    const plan = await owner.mutation(api.contentImports.preview, { package: bundle, target: second });
    expect(plan.entries.map((entry) => entry.action)).toEqual(['add-variant', 'add-variant']);
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'created' }, { status: 'created' }]);

    const variants = await t.run((ctx) => ctx.db.query('factions').collect());
    const heavy = variants.find((variant) => variant.variant_name === 'Spice heavy')!;
    const heavier = variants.find((variant) => variant.variant_name === 'Spice heavier')!;
    expect(heavier.parent_id).toBe(heavy._id);
    expect(heavier.inherited).toEqual(expect.arrayContaining(['troops', 'rules.spiceCount']));
    expect(heavier.inherited).not.toContain('leaders');
    expect(heavier.data.rules.spiceCount).toBe(7);
    expect(heavier.data.troops).toEqual(heavy.data.troops);
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'unchanged' }, { status: 'unchanged' }]);
  });

  test('a change its parent pushes down is not a change to the variant', async () => {
    const { t, owner, family } = await importedFaction();
    const items = (spiceCount: number) => [
      {
        key: 'heavy',
        kind: 'faction',
        faction: family.slug,
        variantName: 'Spice heavy',
        data: { ...spiceHeavy, rules: { ...spiceHeavy.rules, spiceCount } },
      },
      { key: 'heavier', kind: 'faction', faction: family.slug, parent: 'heavy', data: withoutTroopsOrSpice() },
    ];
    await importAll(owner, packageFor('expansion', items(7)), second);

    vi.useFakeTimers();
    const next = packageFor('expansion', items(8));
    expect(await importAll(owner, next, second)).toMatchObject([{ status: 'updated' }, { status: 'unchanged' }]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const heavier = (await t.run((ctx) => ctx.db.query('factions').order('desc').first()))!;
    expect(heavier.data.rules.spiceCount).toBe(8);
    const { entries } = await owner.mutation(api.contentImports.preview, { package: next, target: second });
    expect(entries.map((entry) => entry.status)).toEqual(['unchanged', 'unchanged']);
  });

  test('refuses a parent item of another faction before anything imports', async () => {
    const { t, owner, outsider, family } = await importedFaction();
    await outsider.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
    const theirs = (await t.run((ctx) => ctx.db.query('faction_families').order('desc').first()))!;
    await outsider.mutation(api.factionFamilies.setOpen, { family_id: theirs._id, is_open: true });
    const bundle = packageFor('expansion', [
      { key: 'theirs', kind: 'faction', faction: theirs.slug, variantName: 'Theirs', data: spiceHeavy },
      { key: 'child', kind: 'faction', faction: family.slug, parent: 'theirs', data: withoutTroopsOrSpice() },
    ]);
    const { entries } = await owner.mutation(api.contentImports.preview, { package: bundle, target: second });
    expect(entries[1]).toMatchObject({ status: 'conflict', message: expect.stringMatching(/same faction/) });
  });

  test('follows an existing variant named by its address', async () => {
    const { t, owner, family } = await importedFaction();
    const base = (await t.run((ctx) => ctx.db.get(family.default_variant_id)))!;
    const bundle = packageFor('expansion', [
      { key: 'child', kind: 'faction', faction: family.slug, parent: base.slug, data: withoutTroopsOrSpice() },
    ]);

    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'created' }]);
    const child = (await t.run((ctx) => ctx.db.query('factions').order('desc').first()))!;
    expect(child.parent_id).toBe(base._id);
    expect(child.data.rules.spiceCount).toBe(base.data.rules.spiceCount);
  });

  test('refuses a parent of another faction, and one that cannot be found', async () => {
    const { t, owner, outsider, family } = await importedFaction();
    await outsider.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
    const theirs = (await t.run((ctx) => ctx.db.query('factions').order('desc').first()))!;
    const preview = (parent: string) =>
      owner.mutation(api.contentImports.preview, {
        package: packageFor('expansion', [
          { key: 'child', kind: 'faction', faction: family.slug, parent, data: withoutTroopsOrSpice() },
        ]),
        target: second,
      });

    expect((await preview(theirs.slug)).entries[0]).toMatchObject({
      status: 'conflict',
      message: expect.stringMatching(/same faction/),
    });
    expect((await preview('nowhere')).entries[0]).toMatchObject({
      status: 'conflict',
      message: expect.stringMatching(/was not found/),
    });
  });

  test('is given only with faction, and after the item it names', () => {
    expect(() => packageFor('x', [{ key: 'a', kind: 'faction', parent: 'b', data: assetPublishingFaction }])).toThrow(
      /only when adding a variant/
    );
    expect(() =>
      packageFor('x', [
        { key: 'a', kind: 'faction', faction: 'f', parent: 'b', data: assetPublishingFaction },
        { key: 'b', kind: 'faction', faction: 'f', data: assetPublishingFaction },
      ])
    ).toThrow(/Put parent b before a/);
  });
});
