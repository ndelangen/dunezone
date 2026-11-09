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
