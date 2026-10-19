import type { FunctionReturnType } from 'convex/server';
import { describe, expect, test } from 'vite-plus/test';

import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import { GF9_STRONGHOLD_CARDS, GF9_STRONGHOLD_DECK } from '../src/shared/assets/gf9StrongholdDeck';
import { contentImportPackageSchema } from '../src/shared/contentImports/package';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { normalizeFormattedText } from '../src/shared/formattedText';
import { createRulebookEditorialStarterContents } from '../src/shared/rulebooks/fixtures';
import { DEFAULT_RULEBOOK_SETTINGS } from '../src/shared/rulebooks/settings';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { rulebookFixture } from './rulebooks.test.fixture';

const target = { rulesetSlug: 'rulebook-test-rules', groupSlug: 'rulebook-authors' };
function packageFor(items: unknown[]) {
  return contentImportPackageSchema.parse({
    format: 'dunezone-package',
    version: 1,
    packageKey: 'test-package',
    items,
  });
}
function normalizedRuleText() {
  const result = normalizeFormattedText('The imported rules are complete.');
  if (!result.ok) {
    throw new Error('Invalid fixture text');
  }
  return result.value;
}
function bookItem() {
  const contents = createRulebookEditorialStarterContents();
  contents.pagesById.RULE!.blocksById.TEXT = { id: 'TEXT', kind: 'text', text: normalizedRuleText() };
  return {
    key: 'base-rules',
    kind: 'rulebook',
    data: { name: 'Imported rules', settings: DEFAULT_RULEBOOK_SETTINGS, contents },
  };
}

describe('Content import', () => {
  test('imports complete Edition 1, exports it and retries without creating another Edition', async () => {
    const { t, owner } = await rulebookFixture();
    const bundle = packageFor([bookItem()]);
    const plan = await owner.mutation(api.contentImports.preview, { package: bundle, target });
    expect(plan.entries[0]).toMatchObject({ status: 'create', expectedHash: null });
    const args = { packageKey: bundle.packageKey, item: bundle.items[0]!, target, expectedHash: null };
    const first = await owner.mutation(api.contentImports.applyItem, args);
    expect(first.status).toBe('created');
    expect(await owner.mutation(api.contentImports.applyItem, args)).toMatchObject({
      id: first.id,
      status: 'unchanged',
    });
    const exported = await owner.mutation(api.contentImports.exportRecord, {
      target,
      kind: 'rulebook',
      slug: first.slug,
    });
    expect(contentImportPackageSchema.parse(exported.package).items[0]!.data).toEqual(bundle.items[0]!.data);
    const editions = await t.run((ctx) =>
      ctx.db
        .query('rulebook_editions')
        .withIndex('by_rulebook_and_edition_number', (q) => q.eq('rulebook_id', first.id as Id<'rulebooks'>))
        .take(10)
    );
    expect(editions).toHaveLength(1);
    const stored = await t.run((ctx) =>
      ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (q) => q.eq('edition_id', editions[0]!._id))
        .unique()
    );
    expect(stored?.contents).toEqual((bundle.items[0]!.data as { contents: unknown }).contents);
  });

  test('assigns the requested Group and installs card counts and faction links through normal writers', async () => {
    const { t, owner, ids } = await rulebookFixture();
    const bundle = packageFor([
      { key: 'atreides', kind: 'faction', data: assetPublishingFaction, link: true },
      { key: 'arrakeen', kind: 'asset', type: 'card-stronghold', data: GF9_STRONGHOLD_CARDS[0] },
      {
        key: 'strongholds',
        kind: 'asset',
        type: 'deck',
        data: GF9_STRONGHOLD_DECK,
        members: [{ key: 'arrakeen', count: 2 }],
        slot: 'custom',
      },
    ]);
    const imported: FunctionReturnType<typeof api.contentImports.applyItem>[] = [];
    for (const item of bundle.items) {
      imported.push(
        await owner.mutation(api.contentImports.applyItem, {
          packageKey: bundle.packageKey,
          item,
          target,
          expectedHash: null,
        })
      );
    }
    const faction = await t.run((ctx) => ctx.db.get('factions', imported[0]!.id as Id<'factions'>));
    const deck = await t.run((ctx) => ctx.db.get('assets', imported[2]!.id as Id<'assets'>));
    expect(faction?.group_id).toBe(ids.groupId);
    expect(deck?.group_id).toBe(ids.groupId);
    expect(faction?.owner_id).toBe(ids.ownerId);
    const linked = await t.run((ctx) =>
      ctx.db
        .query('ruleset_factions')
        .withIndex('by_ruleset_faction', (q) => q.eq('ruleset_id', ids.rulesetId).eq('faction_id', faction!._id))
        .unique()
    );
    expect(linked).not.toBeNull();
    const member = await t.run((ctx) =>
      ctx.db
        .query('asset_relations')
        .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deck!._id).eq('kind', 'deck-card'))
        .unique()
    );
    expect(member).toMatchObject({ to_asset_id: imported[1]!.id, count: 2 });
  });

  test('remaps portable bindings and refreshes a linked card when a dependency changes its slug', async () => {
    const { t, owner } = await rulebookFixture();
    const bundle = packageFor([
      { key: 'atreides', kind: 'faction', data: assetPublishingFaction, link: true },
      {
        key: 'nexus-atreides',
        kind: 'asset',
        type: 'card-nexus',
        data: { ...GF9_NEXUS_CARDS[0], factionLink: { id: 'replace-me', slug: 'replace-me' } },
        bindings: [
          { path: ['factionLink', 'id'], key: 'atreides', field: 'id' },
          { path: ['factionLink', 'slug'], key: 'atreides', field: 'slug' },
        ],
      },
    ]);
    const preview = await owner.mutation(api.contentImports.preview, { package: bundle, target });
    expect(preview.entries.map((entry) => entry.status)).toEqual(['create', 'create']);
    const faction = await owner.mutation(api.contentImports.applyItem, {
      packageKey: bundle.packageKey,
      item: bundle.items[0]!,
      target,
      expectedHash: null,
    });
    const cardArgs = { packageKey: bundle.packageKey, item: bundle.items[1]!, target, expectedHash: null };
    const card = await owner.mutation(api.contentImports.applyItem, cardArgs);
    expect(await t.run((ctx) => ctx.db.get('assets', card.id as Id<'assets'>))).toMatchObject({
      data: { factionLink: { id: faction.id, slug: faction.slug } },
    });
    expect(await owner.mutation(api.contentImports.applyItem, cardArgs)).toMatchObject({ status: 'unchanged' });
    const renamed = await owner.mutation(api.contentImports.applyItem, {
      packageKey: bundle.packageKey,
      item: { ...bundle.items[0]!, data: { ...assetPublishingFaction, name: 'House Atreides' } },
      target,
      expectedHash: faction.hash,
    });
    expect(renamed.slug).not.toBe(faction.slug);
    expect(await owner.mutation(api.contentImports.applyItem, { ...cardArgs, expectedHash: card.hash })).toMatchObject({
      id: card.id,
      status: 'updated',
    });
    expect(await t.run((ctx) => ctx.db.get('assets', card.id as Id<'assets'>))).toMatchObject({
      data: { factionLink: { id: faction.id, slug: renamed.slug }, faction: 'House Atreides' },
    });
  });

  test('rejects outsiders and rolls back a failed item including its asset and receipt', async () => {
    const { t, owner, outsider } = await rulebookFixture();
    const bundle = packageFor([{ key: 'card', kind: 'asset', type: 'card-stronghold', data: GF9_STRONGHOLD_CARDS[0] }]);
    const args = {
      packageKey: bundle.packageKey,
      item: { ...bundle.items[0]!, slot: 'custom' },
      target,
      expectedHash: null,
    };
    await expect(outsider.mutation(api.contentImports.applyItem, args)).rejects.toThrow('Not authorized');
    await expect(owner.mutation(api.contentImports.applyItem, args)).rejects.toThrow();
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('assets')
          .withIndex('by_type_and_slug', (q) => q.eq('type', 'card-stronghold').eq('slug', 'arrakeen'))
          .unique()
      )
    ).toBeNull();
    expect(await t.run((ctx) => ctx.db.query('content_import_receipts').take(10))).toEqual([]);
  });

  test('refuses overwriting an independent edit and a stale adoption preview', async () => {
    const { t, owner } = await rulebookFixture();
    const item = packageFor([bookItem()]).items[0]!;
    const imported = await owner.mutation(api.contentImports.applyItem, {
      packageKey: 'test-package',
      item,
      target,
      expectedHash: null,
    });
    await t.run(async (ctx) => {
      const draft = await ctx.db
        .query('rulebook_drafts')
        .withIndex('by_rulebook', (q) => q.eq('rulebook_id', imported.id as Id<'rulebooks'>))
        .unique();
      await ctx.db.patch('rulebook_drafts', draft!._id, { revision: draft!.revision + 1 });
    });
    await expect(
      owner.mutation(api.contentImports.applyItem, {
        packageKey: 'test-package',
        item,
        target,
        expectedHash: imported.hash,
      })
    ).rejects.toThrow('changed since its last import');
    const adopt = { ...item, key: 'adopted-rules', existing: { slug: imported.slug } };
    await expect(
      owner.mutation(api.contentImports.applyItem, {
        packageKey: 'another-package',
        item: adopt,
        target,
        expectedHash: imported.hash,
      })
    ).rejects.toThrow('preview is stale');
  });
  test('refreshes copied Nexus artwork after a dependency changes without renaming', async () => {
    const { t, owner } = await rulebookFixture();
    const factionItem = { key: 'atreides', kind: 'faction', data: assetPublishingFaction };
    const cardItem = {
      key: 'nexus',
      kind: 'asset',
      type: 'card-nexus',
      data: { ...GF9_NEXUS_CARDS[0], factionLink: { id: 'replace-me', slug: 'replace-me' } },
      bindings: [{ path: ['factionLink', 'id'], key: 'atreides', field: 'id' }],
    };
    const original = packageFor([factionItem, cardItem]);
    const first = await owner.mutation(api.contentImports.preview, { package: original, target });
    for (const [index, item] of original.items.entries()) {
      await owner.mutation(api.contentImports.applyItem, {
        packageKey: original.packageKey,
        item,
        target,
        expectedHash: first.entries[index]!.expectedHash,
      });
    }
    const corrected = packageFor([
      {
        ...factionItem,
        data: {
          ...assetPublishingFaction,
          logo: '/vector/logo/fremen.svg',
          background: { ...assetPublishingFaction.background, influence: 0.3 },
        },
      },
      cardItem,
    ]);
    const preview = await owner.mutation(api.contentImports.preview, { package: corrected, target });
    expect(preview.entries.every((entry) => entry.status !== 'conflict')).toBe(true);
    const results: FunctionReturnType<typeof api.contentImports.applyItem>[] = [];
    for (const [index, item] of corrected.items.entries()) {
      results.push(
        await owner.mutation(api.contentImports.applyItem, {
          packageKey: corrected.packageKey,
          item,
          target,
          expectedHash: preview.entries[index]!.expectedHash,
        })
      );
    }
    expect(results[1]!.status).toBe('updated');
    const card = await t.run((ctx) => ctx.db.get('assets', results[1]!.id as Id<'assets'>));
    expect(card).toMatchObject({
      data: { factionSymbol: { image: '/vector/logo/fremen.svg', background: { influence: 0.3 } } },
    });
  });

  test('rejects a stale singleton destination for new and adopted assets before writing', async () => {
    const { t, owner, ids } = await rulebookFixture();
    const first = await owner.mutation(api.assets.create, {
      type: 'deck',
      data: { ...GF9_STRONGHOLD_DECK, name: 'Original deck' },
    });
    const other = await owner.mutation(api.assets.create, {
      type: 'deck',
      data: { ...GF9_STRONGHOLD_DECK, name: 'Someone else deck' },
    });
    const adopted = await owner.mutation(api.assets.create, {
      type: 'deck',
      data: { ...GF9_STRONGHOLD_DECK, name: 'Adopted deck' },
    });
    for (const existing of [undefined, { slug: adopted.slug }]) {
      await owner.mutation(api.rulesets.setAssetSlot, {
        ruleset_id: ids.rulesetId,
        asset_id: first.id,
        slot: 'treachery',
      });
      const item = {
        key: existing ? 'adopted' : 'new-deck',
        kind: 'asset',
        type: 'deck',
        data: { ...GF9_STRONGHOLD_DECK, name: existing ? 'Adopted deck' : 'New deck' },
        slot: 'treachery',
        ...(existing ? { existing } : {}),
      };
      const bundle = packageFor([item]);
      const preview = await owner.mutation(api.contentImports.preview, { package: bundle, target });
      expect(preview.entries[0]!.message).toContain('Original deck');
      await owner.mutation(api.rulesets.setAssetSlot, {
        ruleset_id: ids.rulesetId,
        asset_id: other.id,
        slot: 'treachery',
      });
      await expect(
        owner.mutation(api.contentImports.applyItem, {
          packageKey: bundle.packageKey,
          item,
          target,
          expectedHash: preview.entries[0]!.expectedHash,
        })
      ).rejects.toThrow('preview is stale');
      const slot = await t.run((ctx) =>
        ctx.db
          .query('ruleset_asset_slots')
          .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', ids.rulesetId).eq('slot', 'treachery'))
          .unique()
      );
      expect(slot?.asset_id).toBe(other.id);
      expect(await t.run((ctx) => ctx.db.query('content_import_receipts').take(10))).toEqual([]);
    }
    expect(() =>
      packageFor([
        { key: 'first', kind: 'asset', type: 'deck', data: GF9_STRONGHOLD_DECK, slot: 'treachery' },
        { key: 'second', kind: 'asset', type: 'deck', data: GF9_STRONGHOLD_DECK, slot: 'treachery' },
      ])
    ).toThrow('Only one package item');
  });

  test('removes deleted deck members while retaining add and container authorization checks', async () => {
    const { t, owner, outsider } = await rulebookFixture();
    const bundle = packageFor([
      { key: 'card', kind: 'asset', type: 'card-stronghold', data: GF9_STRONGHOLD_CARDS[0] },
      { key: 'deck', kind: 'asset', type: 'deck', data: GF9_STRONGHOLD_DECK, members: [{ key: 'card', count: 1 }] },
    ]);
    const card = await owner.mutation(api.contentImports.applyItem, {
      packageKey: bundle.packageKey,
      item: bundle.items[0]!,
      target,
      expectedHash: null,
    });
    const deck = await owner.mutation(api.contentImports.applyItem, {
      packageKey: bundle.packageKey,
      item: bundle.items[1]!,
      target,
      expectedHash: null,
    });
    await owner.mutation(api.assets.softDelete, { id: card.id as Id<'assets'> });
    const relationArgs = { container_id: deck.id as Id<'assets'>, member_id: card.id as Id<'assets'>, count: 0 };
    await expect(outsider.mutation(api.assets.setMemberCount, relationArgs)).rejects.toThrow('Not authorized');
    await expect(owner.mutation(api.assets.setMemberCount, { ...relationArgs, count: 1 })).rejects.toThrow('not found');
    const replacement = packageFor([{ ...bundle.items[1]!, members: [] }]);
    const preview = await owner.mutation(api.contentImports.preview, { package: replacement, target });
    expect(preview.entries[0]!.status).toBe('update');
    await owner.mutation(api.contentImports.applyItem, {
      packageKey: replacement.packageKey,
      item: replacement.items[0]!,
      target,
      expectedHash: preview.entries[0]!.expectedHash,
    });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('asset_relations')
          .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deck.id as Id<'assets'>).eq('kind', 'deck-card'))
          .take(10)
      )
    ).toEqual([]);
  });

  test('allows reviewed reconciliation with an exported state hash and refuses an older review', async () => {
    const { t, owner } = await rulebookFixture();
    const original = packageFor([bookItem()]);
    const imported = await owner.mutation(api.contentImports.applyItem, {
      packageKey: original.packageKey,
      item: original.items[0]!,
      target,
      expectedHash: null,
    });
    const advance = async () =>
      await t.run(async (ctx) => {
        const draft = await ctx.db
          .query('rulebook_drafts')
          .withIndex('by_rulebook', (q) => q.eq('rulebook_id', imported.id as Id<'rulebooks'>))
          .unique();
        await ctx.db.patch('rulebook_drafts', draft!._id, { revision: draft!.revision + 1 });
      });
    await advance();
    const exported = await owner.mutation(api.contentImports.exportRecord, {
      target,
      kind: 'rulebook',
      slug: imported.slug,
    });
    const reviewed = packageFor([
      { ...contentImportPackageSchema.parse(exported.package).items[0]!, key: 'base-rules' },
    ]);
    const preview = await owner.mutation(api.contentImports.preview, { package: reviewed, target });
    expect(preview.entries[0]!.status).toBe('update');
    await advance();
    await expect(
      owner.mutation(api.contentImports.applyItem, {
        packageKey: reviewed.packageKey,
        item: reviewed.items[0]!,
        target,
        expectedHash: preview.entries[0]!.expectedHash,
      })
    ).rejects.toThrow('changed since its last import');
    const currentExport = await owner.mutation(api.contentImports.exportRecord, {
      target,
      kind: 'rulebook',
      slug: imported.slug,
    });
    const current = packageFor([
      { ...contentImportPackageSchema.parse(currentExport.package).items[0]!, key: 'base-rules' },
    ]);
    const currentPreview = await owner.mutation(api.contentImports.preview, { package: current, target });
    expect(
      await owner.mutation(api.contentImports.applyItem, {
        packageKey: current.packageKey,
        item: current.items[0]!,
        target,
        expectedHash: currentPreview.entries[0]!.expectedHash,
      })
    ).toMatchObject({ id: imported.id, status: 'updated' });
    expect(
      await owner.mutation(api.contentImports.applyItem, {
        packageKey: current.packageKey,
        item: current.items[0]!,
        target,
        expectedHash: currentPreview.entries[0]!.expectedHash,
      })
    ).toMatchObject({ id: imported.id, status: 'unchanged' });
  });
});
