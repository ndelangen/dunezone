import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { first, importAll, packageFor, second } from './contentImports.test.fixture';
import { rulebookFixture } from './rulebooks.test.fixture';

/** A second Ruleset's package naming the first one's variant reuses it instead of duplicating it (#2931). */
describe('a package item naming an existing variant', () => {
  async function importedVariant() {
    const fixture = await rulebookFixture();
    const [created] = await importAll(
      fixture.owner,
      packageFor('base', [{ key: 'atreides', kind: 'faction', data: assetPublishingFaction, link: true }]),
      first
    );
    const faction = (await fixture.t.run((ctx) => ctx.db.query('factions').first()))!;
    expect(created).toMatchObject({ status: 'created' });
    return { ...fixture, faction };
  }

  const linksIn = (t: Awaited<ReturnType<typeof rulebookFixture>>['t'], rulesetId: Id<'rulesets'>) =>
    t.run((ctx) =>
      ctx.db
        .query('ruleset_factions')
        .withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', rulesetId))
        .collect()
    );

  test('links it to the second Ruleset and creates no faction row', async () => {
    const { t, owner, ids, faction } = await importedVariant();
    const bundle = packageFor('expansion', [
      { key: 'atreides', kind: 'faction', variant: faction.slug, data: assetPublishingFaction },
    ]);

    const plan = await owner.mutation(api.contentImports.preview, { package: bundle, target: second });
    expect(plan.entries[0]).toMatchObject({ status: 'update', action: 'link-variant' });
    expect(plan.entries[0]).not.toHaveProperty('message');
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'linked' }]);

    expect(await t.run((ctx) => ctx.db.query('factions').collect())).toHaveLength(1);
    expect((await linksIn(t, ids.otherRulesetId)).map((link) => link.faction_id)).toEqual([faction._id]);
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'unchanged' }]);
    expect(
      (await owner.mutation(api.contentImports.preview, { package: bundle, target: second })).entries[0]
    ).toMatchObject({ status: 'unchanged' });
  });

  test('updates it where the copy differs and the importer may edit it', async () => {
    const { t, owner, faction } = await importedVariant();
    const data = { ...assetPublishingFaction, rules: { ...assetPublishingFaction.rules, spiceCount: 7 } };
    const bundle = packageFor('expansion', [{ key: 'atreides', kind: 'faction', variant: faction.slug, data }]);

    expect(
      (await owner.mutation(api.contentImports.preview, { package: bundle, target: second })).entries[0]
    ).toMatchObject({ status: 'update', action: 'update-variant' });
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'updated' }]);
    expect((await t.run((ctx) => ctx.db.get(faction._id)))!.data.rules.spiceCount).toBe(7);
  });

  test('links it as it is where the importer may not edit it, and leaves its Group', async () => {
    const { t, owner, outsider, ids } = await importedVariant();
    const theirs = await outsider.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
    const data = { ...assetPublishingFaction, rules: { ...assetPublishingFaction.rules, spiceCount: 7 } };
    const bundle = packageFor('expansion', [{ key: 'theirs', kind: 'faction', variant: theirs.slug, data }]);

    const plan = await owner.mutation(api.contentImports.preview, { package: bundle, target: second });
    expect(plan.entries[0]).toMatchObject({
      status: 'update',
      action: 'link-variant',
      message: expect.stringMatching(/cannot edit/),
    });
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'linked' }]);

    const stored = (await t.run((ctx) => ctx.db.get(theirs._id)))!;
    expect(stored.data.rules.spiceCount).not.toBe(7);
    expect(stored.group_id).toBeNull();
    expect((await linksIn(t, ids.otherRulesetId)).map((link) => link.faction_id)).toEqual([theirs._id]);
  });

  test('writes the copy once the importer may edit a variant it only linked before', async () => {
    const { t, owner, outsider, ids } = await importedVariant();
    const theirs = await outsider.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
    const data = { ...assetPublishingFaction, rules: { ...assetPublishingFaction.rules, spiceCount: 7 } };
    const bundle = packageFor('expansion', [{ key: 'theirs', kind: 'faction', variant: theirs.slug, data }]);
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'linked' }]);

    await t.run((ctx) => ctx.db.patch(theirs._id, { owner_id: ids.ownerId }));
    expect(
      (await owner.mutation(api.contentImports.preview, { package: bundle, target: second })).entries[0]
    ).toMatchObject({ status: 'update', action: 'update-variant' });
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'updated' }]);
    expect((await t.run((ctx) => ctx.db.get(theirs._id)))!.data.rules.spiceCount).toBe(7);
  });

  test('cannot also name it with existing', () => {
    expect(() =>
      packageFor('expansion', [
        { key: 'atreides', kind: 'faction', variant: 'a', existing: { slug: 'a' }, data: assetPublishingFaction },
      ])
    ).toThrow(/variant or existing/);
  });

  test('applyItem refuses an item naming it with both, outside a package', async () => {
    const { owner, faction } = await importedVariant();
    await expect(
      owner.mutation(api.contentImports.applyItem, {
        packageKey: 'expansion',
        item: {
          key: 'atreides',
          kind: 'faction',
          variant: faction.slug,
          existing: { slug: faction.slug },
          data: assetPublishingFaction,
        },
        target: second,
        expectedHash: null,
      })
    ).rejects.toThrow(/variant or existing/);
  });
});
