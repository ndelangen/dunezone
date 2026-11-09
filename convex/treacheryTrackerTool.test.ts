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

test('finds a live deck behind many deleted decks that held the same card', async () => {
  const t = applicationTest();
  await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
    const asset = (type: string, slug: string, data: unknown, is_deleted = false) =>
      ctx.db.insert('assets', {
        owner_id: owner,
        type,
        data,
        slug,
        created_at: stamp,
        updated_at: stamp,
        is_deleted,
        group_id: null,
      });
    const card = await asset('card-treachery', 'lasgun', publishingTreacheryCard);
    for (let index = 0; index <= 30; index++) {
      const name = index === 30 ? 'Live Deck' : `Old Deck ${index}`;
      const deck = await asset(
        'deck',
        `deck-${index}`,
        { name, about: '', cardback: publishingCustomDeckCardback },
        index < 30
      );
      await ctx.db.insert('asset_relations', { from_asset_id: deck, to_asset_id: card, kind: 'deck-card', count: 1 });
    }
  });
  const decks = await t.query(api.treacheryTrackerTool.decks, {});
  expect(decks.map((deck) => deck.name)).toEqual(['Live Deck']);
});

test('lists the decks it can count within a query’s reads, a Ruleset’s deck among them, when the catalogue is far larger', async () => {
  const t = applicationTest({ transactionLimits: true });
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
  const deckIds: Id<'assets'>[] = [];
  for (let batch = 0; batch < 20; batch++) {
    deckIds.push(
      ...(await t.run(async (ctx) => {
        const made = [];
        for (let index = 0; index < 20; index++) {
          const number = batch * 20 + index;
          const deck = await ctx.db.insert('assets', {
            owner_id: owner,
            type: 'deck',
            data: {
              name: `Deck ${String(number).padStart(3, '0')}`,
              about: '',
              cardback: publishingCustomDeckCardback,
            },
            slug: `deck-${number}`,
            created_at: stamp,
            updated_at: stamp,
            is_deleted: false,
            group_id: null,
          });
          for (const card of cards) {
            await ctx.db.insert('asset_relations', {
              from_asset_id: deck,
              to_asset_id: card,
              kind: 'deck-card',
              count: 1,
            });
          }
          made.push(deck);
        }
        return made;
      }))
    );
  }
  const slotted = deckIds.at(-1)!;
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
    await ctx.db.insert('ruleset_asset_slots', { ruleset_id: ruleset, asset_id: slotted, slot: 'treachery' });
  });
  const decks = await t.query(api.treacheryTrackerTool.decks, {});
  expect(decks.length).toBeGreaterThan(20);
  expect(decks[0]).toMatchObject({ id: slotted, cards: 45, rulesets: [{ slug: 'dreamrules', name: 'Dreamrules' }] });
  expect(decks.every((deck) => deck.cards === 45)).toBe(true);
}, 60_000);

test('reads on past a card’s first share of the reads, so a live deck behind many deleted ones is found in a large catalogue', async () => {
  const t = applicationTest({ transactionLimits: true });
  await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
    const asset = (type: string, slug: string, data: unknown, is_deleted = false) =>
      ctx.db.insert('assets', {
        owner_id: owner,
        type,
        data,
        slug,
        created_at: stamp,
        updated_at: stamp,
        is_deleted,
        group_id: null,
      });
    /* Enough cards that each one's first share of the reads is 50 rows. */
    const cards = [];
    for (let index = 0; index < 200; index++) {
      cards.push(await asset('card-treachery', `card-${index}`, publishingTreacheryCard));
    }
    for (let index = 0; index <= 60; index++) {
      const name = index === 60 ? 'Live Deck' : `Old Deck ${index}`;
      const deck = await asset(
        'deck',
        `deck-${index}`,
        { name, about: '', cardback: publishingCustomDeckCardback },
        index < 60
      );
      await ctx.db.insert('asset_relations', {
        from_asset_id: deck,
        to_asset_id: cards[0],
        kind: 'deck-card',
        count: 1,
      });
    }
  });
  const decks = await t.query(api.treacheryTrackerTool.decks, {});
  expect(decks.map((deck) => deck.name)).toEqual(['Live Deck']);
}, 60_000);
