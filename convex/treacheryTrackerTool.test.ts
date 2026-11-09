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
  await deck('Homebrew Weapons', [{ id: lasgun, count: 3 }]);
  await deck('Spice Deck', [{ id: blow, count: 2 }]);
  await deck('Deleted Treachery', [{ id: lasgun, count: 1 }], true);
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

test('offers every live deck of Treachery cards, a Ruleset’s first, with its copies and the live Rulesets that slot it', async () => {
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
    { name: 'Homebrew Weapons', slug: 'homebrew-weapons', cards: 3, rulesets: [] },
  ]);
});
