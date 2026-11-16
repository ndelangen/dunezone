import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { first, importAll, packageFor, second } from './contentImports.test.fixture';
import { rulebookFixture } from './rulebooks.test.fixture';

const changed = {
  ...assetPublishingFaction,
  name: 'A name the package may not give the Faction',
  rules: { ...assetPublishingFaction.rules, spiceCount: 7 },
};

/** A package item naming an existing Faction becomes a new variant of it rather than a new Faction (#2931). */
describe('a package item naming an existing faction', () => {
  async function importedFaction() {
    const fixture = await rulebookFixture();
    await importAll(
      fixture.owner,
      packageFor('base', [{ key: 'atreides', kind: 'faction', data: assetPublishingFaction, link: true }]),
      first
    );
    const family = (await fixture.t.run((ctx) => ctx.db.query('faction_families').first()))!;
    return { ...fixture, family };
  }

  test('adds a variant named after the Ruleset, keeping the Faction’s shared fields', async () => {
    const { t, owner, ids, family } = await importedFaction();
    const bundle = packageFor('expansion', [
      { key: 'atreides', kind: 'faction', faction: family.slug, data: changed, link: true },
    ]);

    const plan = await owner.mutation(api.contentImports.preview, { package: bundle, target: second });
    expect(plan.entries[0]).toMatchObject({
      status: 'create',
      action: 'add-variant',
      variant: 'Other Rulebook test rules',
    });
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'created' }]);

    const variants = await t.run((ctx) => ctx.db.query('factions').collect());
    expect(variants).toHaveLength(2);
    const added = variants.find((variant) => variant.variant_name === 'Other Rulebook test rules')!;
    expect(added).toMatchObject({ family_id: family._id, owner_id: ids.ownerId, group_id: ids.groupId });
    expect(added.data.name).toBe(assetPublishingFaction.name);
    expect(added.data.rules.spiceCount).toBe(7);
    expect(await t.run((ctx) => ctx.db.query('faction_families').collect())).toHaveLength(1);
    const links = await t.run((ctx) =>
      ctx.db
        .query('ruleset_factions')
        .withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', ids.otherRulesetId))
        .collect()
    );
    expect(links.map((link) => link.faction_id)).toEqual([added._id]);
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'unchanged' }]);
  });

  test('takes the variant name the item gives, and refuses one a sibling has', async () => {
    const { owner, family } = await importedFaction();
    const named = packageFor('expansion', [
      { key: 'atreides', kind: 'faction', faction: family.slug, variantName: 'Spice heavy', data: changed },
    ]);
    expect(await importAll(owner, named, second)).toMatchObject([{ slug: `${family.slug}-spice-heavy` }]);

    const clash = packageFor('again', [
      { key: 'atreides', kind: 'faction', faction: family.slug, variantName: 'Spice heavy', data: changed },
    ]);
    expect(
      (await owner.mutation(api.contentImports.preview, { package: clash, target: second })).entries[0]
    ).toMatchObject({ status: 'conflict', message: expect.stringMatching(/already has a variant/) });
  });

  test('takes a hand-written copy whose leaders and troops carry no IDs', async () => {
    const { t, owner, family } = await importedFaction();
    const { memberId: _leaderId, ...factionLeader } = changed.factionLeader;
    const data = {
      ...changed,
      factionLeader,
      leaders: changed.leaders.map(({ memberId: _memberId, ...leader }) => leader),
      troops: changed.troops.map(({ troopId: _troopId, ...troop }) => troop),
    };
    const bundle = packageFor('expansion', [{ key: 'atreides', kind: 'faction', faction: family.slug, data }]);

    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'created' }]);
    const added = (await t.run((ctx) => ctx.db.query('factions').order('desc').first()))!;
    expect(added.data.rules.spiceCount).toBe(7);
    expect(added.data.troops.every((troop: { troopId?: string }) => troop.troopId)).toBe(true);
    expect(await importAll(owner, bundle, second)).toMatchObject([{ status: 'unchanged' }]);
    const changedBundle = packageFor('expansion', [
      {
        key: 'atreides',
        kind: 'faction',
        faction: family.slug,
        data: { ...data, rules: { ...data.rules, spiceCount: 9 } },
      },
    ]);
    expect(await importAll(owner, changedBundle, second)).toMatchObject([{ status: 'updated' }]);
    const updated = (await t.run((ctx) => ctx.db.get(added._id)))!;
    expect(updated.data.troops.map((troop: { troopId?: string }) => troop.troopId)).toEqual(
      added.data.troops.map((troop: { troopId?: string }) => troop.troopId)
    );
    expect(updated.data.factionLeader.memberId).toBe(added.data.factionLeader.memberId);
  });

  test('refuses a second item of the package adding the same variant', async () => {
    const { owner, family } = await importedFaction();
    const bundle = packageFor('expansion', [
      { key: 'one', kind: 'faction', faction: family.slug, data: changed },
      { key: 'two', kind: 'faction', faction: family.slug, data: changed },
    ]);
    const { entries } = await owner.mutation(api.contentImports.preview, { package: bundle, target: second });
    expect(entries.map((entry) => entry.status)).toEqual(['create', 'conflict']);
    expect(entries[1]!.message).toMatch(/already adds the variant/);
    const nextPage = await owner.mutation(api.contentImports.preview, { package: bundle, target: second, cursor: 1 });
    expect(nextPage.entries[0]).toMatchObject({ status: 'conflict', message: expect.stringMatching(/already adds/) });
  });

  test('does not count an item its receipt ties to a variant as adding the name it gives now', async () => {
    const { owner, family } = await importedFaction();
    const one = { key: 'one', kind: 'faction', faction: family.slug, variantName: 'First', data: changed };
    await importAll(owner, packageFor('expansion', [one]), second);
    const bundle = packageFor('expansion', [
      { ...one, variantName: 'Second' },
      { key: 'two', kind: 'faction', faction: family.slug, variantName: 'Second', data: changed },
    ]);
    const nextPage = await owner.mutation(api.contentImports.preview, { package: bundle, target: second, cursor: 1 });
    expect(nextPage.entries[0]).toMatchObject({ status: 'create', action: 'add-variant' });
  });

  test('refuses a closed faction the importer does not maintain', async () => {
    const { owner, outsider, t } = await importedFaction();
    await outsider.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
    const theirs = (await t.run((ctx) => ctx.db.query('faction_families').order('desc').first()))!;
    const bundle = packageFor('expansion', [{ key: 'theirs', kind: 'faction', faction: theirs.slug, data: changed }]);

    expect(
      (await owner.mutation(api.contentImports.preview, { package: bundle, target: second })).entries[0]
    ).toMatchObject({ status: 'conflict', message: expect.stringMatching(/closed/) });
    await expect(importAll(owner, bundle, second)).rejects.toThrow(/closed/);
  });

  test('cannot also name an existing record, and names a variant only when adding one', () => {
    expect(() =>
      packageFor('x', [{ key: 'a', kind: 'faction', faction: 'f', variant: 'v', data: assetPublishingFaction }])
    ).toThrow(/cannot also name an existing record/);
    expect(() =>
      packageFor('x', [{ key: 'a', kind: 'faction', variantName: 'Spice heavy', data: assetPublishingFaction }])
    ).toThrow(/only when adding it/);
  });
});
