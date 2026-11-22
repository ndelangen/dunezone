import { expect, test } from 'vite-plus/test';

import { publishingCustomDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { applicationTest } from './application.test.fixture';

const stamp = '2026-11-09T00:00:00.000Z';

async function seed(ctx: MutationCtx) {
  const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
  const asset = (type: string, name: string, data: unknown, is_deleted = false) =>
    ctx.db.insert('assets', {
      owner_id: owner,
      type,
      data,
      slug: name.toLowerCase().replaceAll(' ', '-'),
      created_at: stamp,
      updated_at: stamp,
      is_deleted,
      group_id: null,
    });
  const deck = async (name: string, cards: { id: Id<'assets'>; count: number }[], is_deleted = false) => {
    const id = await asset('deck', name, { name, about: '', cardback: publishingCustomDeckCardback }, is_deleted);
    for (const card of cards) {
      await ctx.db.insert('asset_relations', {
        from_asset_id: id,
        to_asset_id: card.id,
        kind: 'deck-card',
        count: card.count,
      });
    }
    return id;
  };
  const ruleset = (name: string, is_deleted = false) =>
    ctx.db.insert('rulesets', {
      name,
      slug: name.toLowerCase(),
      about: '',
      owner_id: owner,
      group_id: null,
      is_deleted,
      image_cover: null,
      created_at: stamp,
      updated_at: stamp,
    });

  const lasgun = await asset('card-treachery', 'Lasgun', publishingTreacheryCard);
  const shield = await asset('card-treachery', 'Shield', publishingTreacheryCard);
  const blow = await asset('card-spice', 'Habbanya Erg', publishingSpiceCard);
  const dreamrules = await deck('Dreamrules Treachery', [
    { id: lasgun, count: 1 },
    { id: shield, count: 4 },
  ]);
  const custom = await asset('card-custom', 'House Rule', {});
  await deck('Homebrew Weapons', [
    { id: custom, count: 1 },
    { id: lasgun, count: 3 },
  ]);
  await deck('Spice Deck', [{ id: blow, count: 2 }]);
  await deck('Deleted Treachery', [{ id: lasgun, count: 1 }], true);
  const gone = await asset('card-treachery', 'Gone', publishingTreacheryCard, true);
  await deck('Only Deleted Cards', [{ id: gone, count: 2 }]);
  await deck('Empty Deck', []);
  await ctx.db.insert('ruleset_asset_slots', {
    ruleset_id: await ruleset('Dreamrules'),
    asset_id: dreamrules,
    slot: 'treachery',
  });
  await ctx.db.insert('ruleset_asset_slots', {
    ruleset_id: await ruleset('Retired', true),
    asset_id: dreamrules,
    slot: 'treachery',
  });
}

test('offers every live deck holding live Treachery cards, whatever its first card, a Ruleset’s first, with its live copies and the live Rulesets that slot it', async () => {
  const t = applicationTest();
  await t.run(seed);
  const decks = await t.query(api.treacheryTrackerTool.decks, {});
  expect(decks.map(({ name, slug, cards, rulesets }) => ({ name, slug, cards, rulesets }))).toEqual([
    {
      name: 'Dreamrules Treachery',
      slug: 'dreamrules-treachery',
      cards: 5,
      rulesets: [{ slug: 'dreamrules', name: 'Dreamrules' }],
    },
    { name: 'Homebrew Weapons', slug: 'homebrew-weapons', cards: 4, rulesets: [] },
  ]);
});

/* 400 decks of the same 45 cards, written a few at a time to stay inside each write's own limits, and a Ruleset slotting the last. */
/* One deck of the large catalogue, holding one copy of each card. */
async function seedDeck(ctx: MutationCtx, owner: Id<'users'>, number: number, cards: readonly Id<'assets'>[]) {
  const deck = await ctx.db.insert('assets', {
    owner_id: owner,
    type: 'deck',
    data: { name: `Deck ${String(number).padStart(3, '0')}`, about: '', cardback: publishingCustomDeckCardback },
    slug: `deck-${number}`,
    created_at: stamp,
    updated_at: stamp,
    is_deleted: false,
    group_id: null,
  });
  for (const card of cards) {
    await ctx.db.insert('asset_relations', { from_asset_id: deck, to_asset_id: card, kind: 'deck-card', count: 1 });
  }
  return deck;
}

async function seedLargeCatalogue(t: ReturnType<typeof applicationTest>) {
  const { owner, cards } = await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
    const cards = [];
    for (let index = 0; index < 45; index++) {
      cards.push(
        await ctx.db.insert('assets', {
          owner_id: owner,
          type: 'card-treachery',
          data: publishingTreacheryCard,
          slug: `card-${index}`,
          created_at: stamp,
          updated_at: stamp,
          is_deleted: false,
          group_id: null,
        })
      );
    }
    return { owner, cards };
  });
  let slotted: Id<'assets'> | undefined;
  for (let batch = 0; batch < 20; batch++) {
    slotted = await t.run(async (ctx) => {
      let last;
      for (let index = 0; index < 20; index++) {
        last = await seedDeck(ctx, owner, batch * 20 + index, cards);
      }
      return last;
    });
  }
  await t.run(async (ctx) => {
    const ruleset = await ctx.db.insert('rulesets', {
      name: 'Dreamrules',
      slug: 'dreamrules',
      about: '',
      owner_id: owner,
      group_id: null,
      is_deleted: false,
      image_cover: null,
      created_at: stamp,
      updated_at: stamp,
    });
    await ctx.db.insert('ruleset_asset_slots', { ruleset_id: ruleset, asset_id: slotted!, slot: 'treachery' });
  });
  return slotted!;
}

test('lists the decks it can count within a query’s reads, a Ruleset’s deck among them, when the catalogue is far larger', async () => {
  const t = applicationTest({ transactionLimits: true });
  const slotted = await seedLargeCatalogue(t);
  const decks = await t.query(api.treacheryTrackerTool.decks, {});
  expect(decks.length).toBeGreaterThan(20);
  expect(decks[0]).toMatchObject({ id: slotted, cards: 45, rulesets: [{ slug: 'dreamrules', name: 'Dreamrules' }] });
  expect(decks.every((deck) => deck.cards === 45)).toBe(true);
}, 60_000);

/* An asset of the given type in a test catalogue. */
function insertAsset(
  ctx: MutationCtx,
  owner: Id<'users'>,
  type: string,
  slug: string,
  data: unknown,
  is_deleted = false
) {
  return ctx.db.insert('assets', {
    owner_id: owner,
    type,
    data,
    slug,
    created_at: stamp,
    updated_at: stamp,
    is_deleted,
    group_id: null,
  });
}

test('stays inside a query’s calls when many decks mix one Treachery card with many others', async () => {
  const t = applicationTest({ transactionLimits: true });
  const { owner, card } = await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
    return { owner, card: await insertAsset(ctx, owner, 'card-treachery', 'lasgun', publishingTreacheryCard) };
  });
  for (let batch = 0; batch < 10; batch++) {
    await t.run(async (ctx) => {
      for (let index = 0; index < 20; index++) {
        const number = batch * 20 + index;
        const data = {
          name: `Mixed ${String(number).padStart(3, '0')}`,
          about: '',
          cardback: publishingCustomDeckCardback,
        };
        const deck = await insertAsset(ctx, owner, 'deck', `mixed-${number}`, data);
        await ctx.db.insert('asset_relations', { from_asset_id: deck, to_asset_id: card, kind: 'deck-card', count: 1 });
        for (let other = 0; other < 20; other++) {
          const custom = await insertAsset(ctx, owner, 'card-custom', `custom-${number}-${other}`, {});
          await ctx.db.insert('asset_relations', {
            from_asset_id: deck,
            to_asset_id: custom,
            kind: 'deck-card',
            count: 1,
          });
        }
      }
    });
  }
  const decks = await t.query(api.treacheryTrackerTool.decks, {});
  expect(decks.length).toBeGreaterThan(0);
  expect(decks.every((deck) => deck.cards === 21)).toBe(true);
}, 60_000);

/*
 * A live deck holding the first of `cards` Treachery cards, behind `deleted` deleted decks that held it too.
 * Deleting a deck keeps its membership rows, so the deleted decks come first when that card's decks are read.
 */
async function liveBehindDeleted(cards: number, deleted: number) {
  const t = applicationTest({ transactionLimits: true });
  await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
    const ids = [];
    for (let index = 0; index < cards; index++) {
      ids.push(await insertAsset(ctx, owner, 'card-treachery', `card-${index}`, publishingTreacheryCard));
    }
    for (let index = 0; index <= deleted; index++) {
      const name = index === deleted ? 'Live Deck' : `Old Deck ${index}`;
      const data = { name, about: '', cardback: publishingCustomDeckCardback };
      const deck = await insertAsset(ctx, owner, 'deck', `deck-${index}`, data, index < deleted);
      await ctx.db.insert('asset_relations', { from_asset_id: deck, to_asset_id: ids[0], kind: 'deck-card', count: 1 });
    }
  });
  return (await t.query(api.treacheryTrackerTool.decks, {})).map((deck) => deck.name);
}

test('finds a live deck behind many deleted decks that held the same card', async () => {
  await expect(liveBehindDeleted(1, 30)).resolves.toEqual(['Live Deck']);
});

test('reads on past a card’s first share of the reads, so a live deck behind many deleted ones is found in a large catalogue', async () => {
  /* Enough cards that each one's first share of the reads is 50 rows. */
  await expect(liveBehindDeleted(200, 60)).resolves.toEqual(['Live Deck']);
}, 60_000);

test('a deleted deck costs only its lookup, so many of them ahead of a live deck still leave it listed', async () => {
  await expect(liveBehindDeleted(1, 400)).resolves.toEqual(['Live Deck']);
}, 60_000);
