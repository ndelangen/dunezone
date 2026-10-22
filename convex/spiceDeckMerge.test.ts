/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';

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
const SHORT_NAMES: Record<string, string> = {
  'Habbanya Ridge Flat': 'Habbanya R. Flat',
  'Rock Outcroppings': 'Rock Outcrops',
};

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
    const data = spice(SHORT_NAMES[name] ?? name, highlight, copyAmount(amount), {
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
    const planned = await t.mutation(internal.spiceDeckMerge.mergeDuplicateSpiceCards, { dryRun: true });
    expect(planned.map(({ original, copy, decks }) => [original, copy, decks])).toEqual(
      originals.map((original, index) => [original, copies[index], [gf9]])
    );
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
    expect(rows.slice(15).every((row) => row!.is_deleted)).toBe(true);
    expect(rows[20]!.slug).toBe('habbanya-r-flat');
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
