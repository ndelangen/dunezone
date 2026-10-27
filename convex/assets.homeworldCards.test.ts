/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { publishingCustomDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { EXAMPLE_HOMEWORLD_CARD } from '../src/shared/assets/homeworldTemplate';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

test('Homeworlds save without a faction, join decks, and publish the authored thresholds and strengths', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  await expect(
    t.mutation(api.assets.create, { type: 'card-homeworld', data: EXAMPLE_HOMEWORLD_CARD })
  ).rejects.toThrow();
  const created = await owner.mutation(api.assets.create, { type: 'card-homeworld', data: EXAMPLE_HOMEWORLD_CARD });
  const page = await t.query(api.assets.page, { type: 'card-homeworld', slug: created.slug });
  expect(page?.asset.data).toEqual(EXAMPLE_HOMEWORLD_CARD);
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-homeworld').eq('asset_id', created.id))
      .unique()
  );
  expect(job?.asset_data.card).toEqual(EXAMPLE_HOMEWORLD_CARD);
  const deck = await owner.mutation(api.assets.create, {
    type: 'deck',
    data: { name: 'Homeworld choices', about: '', cardback: publishingCustomDeckCardback },
  });
  await owner.mutation(api.assets.setMemberCount, { container_id: deck.id, member_id: created.id, count: 1 });
  const deckPage = await t.query(api.assets.page, { type: 'deck', slug: deck.slug });
  expect(deckPage?.members).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        count: 1,
        member: expect.objectContaining({ type: 'card-homeworld', id: created.id }),
      }),
    ])
  );
  for (const update of [
    { threshold: 0 },
    { threshold: 1.5 },
    { high: { text: 'Rules', strength: -1 } },
    { low: { text: 'Rules', strength: 1.5 } },
    { occupied: 'x'.repeat(401) },
    { occupied: Array(7).fill('line').join('\n') },
    { icon: [EXAMPLE_HOMEWORLD_CARD.icon[0], 'https://example.com/planet.png'] },
    { factionLink: { id: 'a faction', slug: 'a-faction' } },
  ]) {
    await expect(
      owner.mutation(api.assets.update, { id: created.id, data: { ...EXAMPLE_HOMEWORLD_CARD, ...update } })
    ).rejects.toThrow();
  }
  expect((await t.query(api.assets.page, { type: 'card-homeworld', slug: created.slug }))?.asset.data).toEqual(
    EXAMPLE_HOMEWORLD_CARD
  );
  const strangerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
  await expect(
    t
      .withIdentity({ subject: strangerId })
      .mutation(api.assets.update, { id: created.id, data: EXAMPLE_HOMEWORLD_CARD })
  ).rejects.toThrow();
  const edited = { ...EXAMPLE_HOMEWORLD_CARD, threshold: 8, low: { text: 'No penalty.', strength: 0 } };
  await owner.mutation(api.assets.update, { id: created.id, data: edited });
  expect((await t.query(api.assets.page, { type: 'card-homeworld', slug: created.slug }))?.asset.data).toEqual(edited);
});
