import { expect, test } from 'vite-plus/test';

import { publishingCustomDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { api } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import { applicationTest } from './application.test.fixture';

const stamp = '2026-11-09T00:00:00.000Z';

async function seed(ctx: MutationCtx) {
  const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
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
  const deck = (name: string, is_deleted = false) =>
    ctx.db.insert('assets', {
      owner_id: owner,
      type: 'deck',
      data: { name, about: '', cardback: publishingCustomDeckCardback },
      slug: name.toLowerCase().replaceAll(' ', '-'),
      created_at: stamp,
      updated_at: stamp,
      is_deleted,
      group_id: null,
    });
  const slot = async (rulesetId: Awaited<ReturnType<typeof ruleset>>, deckId: Awaited<ReturnType<typeof deck>>) =>
    ctx.db.insert('ruleset_asset_slots', { ruleset_id: rulesetId, asset_id: deckId, slot: 'spice' });

  await slot(await ruleset('KISS'), await deck('KISS Spice Deck'));
  await slot(await ruleset('Dreamrules'), await deck('Dreamrules Spice Deck'));
  await slot(await ruleset('Retired', true), await deck('Retired Spice Deck'));
  await slot(await ruleset('Gone deck'), await deck('Gone Spice Deck', true));
  await ruleset('No spice');
}

test('offers the spice deck of every live ruleset that slots one, by ruleset name', async () => {
  const t = applicationTest();
  await t.run(seed);
  const decks = await t.query(api.spiceDeckTool.decks, {});
  expect(decks.map(({ ruleset, deck }) => [ruleset, deck.name, deck.slug])).toEqual([
    ['Dreamrules', 'Dreamrules Spice Deck', 'dreamrules-spice-deck'],
    ['KISS', 'KISS Spice Deck', 'kiss-spice-deck'],
  ]);
});
