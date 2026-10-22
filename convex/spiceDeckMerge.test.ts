/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { contentImportPackageSchema } from '../src/shared/contentImports/package';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { rulebookFixture } from './rulebooks.test.fixture';

/* Thirty cards and two decks go through the full create path. */
const BUDGET_MS = 30_000;

const TERRITORIES = [
  ['Broken Land', 'broken-land', 8],
  ['Cielago North', 'cielago-north', 8],
  ['Cielago South', 'cielago-south', 12],
  ['Funeral Plain', 'funeral-plain', 6],
  ['Habbanya Erg', 'habbanya-erg', 8],
  ['Habbanya Ridge Flat', 'habbanya-ridge-flat', 10],
  ['Hagga Basin', 'hagga-basin', 6],
  ['Old Gap', 'old-gap', 6],
  ['Red Chasm', 'red-chasm', 8],
  ['Rock Outcroppings', 'rock-outcroppings', 6],
  ['Sihaya Ridge', 'sihaya-ridge', 6],
  ['South Mesa', 'south-mesa', 10],
  ['The Great Flat', 'the-great-flat', 10],
  ['The Minor Erg', 'the-minor-erg', 8],
  ['Wind Pass North', 'wind-pass-north', 6],
] as const;

const spice = (name: string, highlight: string, amount: number, extra: object = {}) => ({
  name,
  subName: 'Spice blow',
  icon: 'spice',
  highlights: [highlight],
  amount,
  about: '',
  ...extra,
});
const deck = (name: string) => ({ name, about: '', cardback: { mode: 'preset', key: 'spice' } });

async function setup(copyAmount = (amount: number) => amount) {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner' }));
  const owner = t.withIdentity({ subject: ownerId });
  const originals: Id<'assets'>[] = [];
  const copies: Id<'assets'>[] = [];
  for (const [name, highlight, amount] of TERRITORIES) {
    originals.push(
      (await owner.mutation(api.assets.create, { type: 'card-spice', data: spice(name, highlight, amount) })).id
    );
  }
  for (const [name, highlight, amount] of TERRITORIES) {
    const data = spice(name, highlight, copyAmount(amount), {
      text: 'West sector.',
      about: `GF9 base Spice Card. Place ${amount} spice in ${name}.`,
    });
    copies.push((await owner.mutation(api.assets.create, { type: 'card-spice', data })).id);
  }
  const dreamrules = await owner.mutation(api.assets.create, { type: 'deck', data: deck('Dreamrules Spice Deck') });
  const gf9 = await owner.mutation(api.assets.create, { type: 'deck', data: deck('GF9 Spice Deck') });
  await t.run(async (ctx) => {
    for (const [deckId, members] of [
      [dreamrules.id, originals],
      [gf9.id, copies],
    ] as const) {
      for (const member of members) {
        await ctx.db.insert('asset_relations', {
          from_asset_id: deckId,
          to_asset_id: member,
          kind: 'deck-card',
          count: 1,
        });
      }
    }
  });
  return { t, originals, copies, dreamrules: dreamrules.id, gf9: gf9.id };
}

const members = (t: ReturnType<typeof applicationTest>, deckId: Id<'assets'>) =>
  t.run(async (ctx) =>
    (
      await ctx.db
        .query('asset_relations')
        .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deckId).eq('kind', 'deck-card'))
        .collect()
    ).map(({ to_asset_id, count }) => [to_asset_id, count])
  );

test(
  'folds each GF9 copy into its original: the original takes the caption and About, both decks share it, and the copy is retired',
  async () => {
    const { t, originals, copies, dreamrules, gf9 } = await setup();
    await onBoard(t, copies[0], 'arrakis-board');
    const { cards: planned } = await t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: true });
    expect(planned.map(({ original, copy, decks }) => [original, copy, decks])).toEqual(
      originals.map((original, index) => [original, copies[index], [{ deck: gf9, before: 0, after: 1 }]])
    );
    expect(planned[5]).toMatchObject({
      name: 'Habbanya Ridge Flat',
      text: 'West sector.',
      about: 'GF9 base Spice Card. Place 10 spice in Habbanya Ridge Flat.',
    });
    expect(planned[0]!.board).toBe('arrakis-board');
    expect(planned[1]!.board).toBeNull();
    await expect(members(t, gf9)).resolves.toEqual(copies.map((copy) => [copy, 1]));

    await t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: false });
    const expected = originals.map((original) => [original, 1]);
    await expect(members(t, dreamrules)).resolves.toEqual(expected);
    await expect(members(t, gf9)).resolves.toEqual(expected);
    const rows = await t.run(async (ctx) => Promise.all([...originals, ...copies].map((id) => ctx.db.get(id))));
    const habbanya = rows[5]!;
    expect(habbanya).toMatchObject({ is_deleted: false, slug: 'habbanya-ridge-flat' });
    expect(habbanya.data).toMatchObject({
      name: 'Habbanya Ridge Flat',
      text: 'West sector.',
      about: 'GF9 base Spice Card. Place 10 spice in Habbanya Ridge Flat.',
    });
    /* The copy's move onto a saved board is the newer work, so the original carries it on. */
    expect(rows[0]!.data.board).toEqual(BOARD('arrakis-board'));
    expect(rows.slice(15).every((row) => row!.is_deleted)).toBe(true);
    expect(rows[20]!.slug).toBe('habbanya-ridge-flat-1');
    /* A second run finds the copies retired and stops before writing. */
    await expect(t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: true })).rejects.toThrow(
      'No live Spice card at card-spice/broken-land-1'
    );
  },
  BUDGET_MS
);

test(
  'refuses before any write when a copy is not the same card',
  async () => {
    const { t, originals, gf9, copies } = await setup((amount) => (amount === 12 ? 11 : amount));
    await expect(t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: false })).rejects.toThrow(
      'card-spice/cielago-south-1 is not a copy of card-spice/cielago-south'
    );
    await expect(members(t, gf9)).resolves.toEqual(copies.map((copy) => [copy, 1]));
    const first = await t.run((ctx) => ctx.db.get(originals[0]));
    expect(first!.data.about).toBe('');
  },
  BUDGET_MS
);

const BOARD = (asset_id: string) => ({ asset_id, tints: [], tokens: [] });
const onBoard = (t: ReturnType<typeof applicationTest>, cardId: Id<'assets'>, board: string) =>
  t.run(async (ctx) => {
    const card = (await ctx.db.get(cardId))!;
    await ctx.db.patch(cardId, { data: { ...card.data, board: BOARD(board) } });
  });

test(
  'refuses before any write when the original already sits on another saved board',
  async () => {
    const { t, originals, copies } = await setup();
    await onBoard(t, originals[1], 'own-board');
    await onBoard(t, copies[1], 'arrakis-board');
    await expect(t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: false })).rejects.toThrow(
      'card-spice/cielago-north and card-spice/cielago-north-1 sit on different saved boards'
    );
    const first = await t.run((ctx) => ctx.db.get(originals[0]));
    expect(first!.data.about).toBe('');
  },
  BUDGET_MS
);

const membership = (t: ReturnType<typeof applicationTest>, deckId: Id<'assets'>, cardId: Id<'assets'>, count: number) =>
  t.run(async (ctx) => {
    await ctx.db.insert('asset_relations', { from_asset_id: deckId, to_asset_id: cardId, kind: 'deck-card', count });
  });

test(
  'adds the counts in a deck that holds both cards, and refuses a total past the member limit',
  async () => {
    const { t, originals, copies, dreamrules } = await setup();
    await membership(t, dreamrules, copies[0], 2);
    const { cards: planned } = await t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: true });
    expect(planned[0].decks).toContainEqual({ deck: dreamrules, before: 1, after: 3 });
    await t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: false });
    const held = await members(t, dreamrules);
    expect(held.filter(([id]) => id === originals[0])).toEqual([[originals[0], 3]]);
    expect(held.some(([id]) => id === copies[0])).toBe(false);

    const full = await setup();
    await membership(full.t, full.dreamrules, full.copies[1], 99);
    await expect(full.t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: true })).rejects.toThrow(
      'past the limit of 99'
    );
  },
  BUDGET_MS * 2
);

test(
  'keeps the GF9 import receipts on the merged cards, so the next preview reads every entry as unchanged',
  async () => {
    const { t, owner } = await rulebookFixture();
    const target = { rulesetSlug: 'rulebook-test-rules', groupSlug: 'rulebook-authors' };
    const originals: Id<'assets'>[] = [];
    for (const [name, highlight, amount] of TERRITORIES) {
      originals.push(
        (await owner.mutation(api.assets.create, { type: 'card-spice', data: spice(name, highlight, amount) })).id
      );
    }
    const bundle = contentImportPackageSchema.parse({
      format: 'dunezone-package',
      version: 1,
      packageKey: 'gf9-test',
      items: [
        ...TERRITORIES.map(([name, highlight, amount]) => ({
          key: highlight,
          kind: 'asset',
          type: 'card-spice',
          data: spice(name, highlight, amount, { text: 'West sector.', about: 'GF9.' }),
        })),
        {
          key: 'gf9-spice-deck',
          kind: 'asset',
          type: 'deck',
          data: deck('GF9 Spice Deck'),
          members: TERRITORIES.map(([, highlight]) => ({ key: highlight, count: 1 })),
        },
      ],
    });
    const importAll = async () => {
      const plan = await owner.mutation(api.contentImports.preview, { package: bundle, target });
      for (const [index, item] of bundle.items.entries()) {
        await owner.mutation(api.contentImports.applyItem, {
          packageKey: bundle.packageKey,
          item,
          target,
          expectedHash: plan.entries[index]!.expectedHash,
        });
      }
    };
    await importAll();

    const merged = await t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: false });
    expect(merged.receipts).toHaveLength(16);
    expect(merged.cards[0]!.group).not.toBeNull();
    const plan = await owner.mutation(api.contentImports.preview, { package: bundle, target });
    expect(plan.entries.map(({ key, status }) => [key, status])).toEqual(
      bundle.items.map(({ key }) => [key, 'unchanged'])
    );
    /* Applying the package again changes nothing the merge decided. */
    await importAll();
    const cards = await t.run((ctx) => Promise.all(originals.map((id) => ctx.db.get(id))));
    expect(cards.every((card) => card && !card.is_deleted)).toBe(true);
    expect(cards[5]!.data.name).toBe('Habbanya Ridge Flat');
  },
  BUDGET_MS * 2
);
