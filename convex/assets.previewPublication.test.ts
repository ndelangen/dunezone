/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { EXAMPLE_HOMEWORLD_CARD } from '../src/shared/assets/homeworldTemplate';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

test('the asset page refreshes its preview when a renderer republishes an unchanged card', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const created = await t.withIdentity({ subject: ownerId }).mutation(api.assets.create, {
    type: 'card-homeworld',
    data: EXAMPLE_HOMEWORLD_CARD,
  });
  const address = { type: 'card-homeworld', slug: created.slug };
  const original = await t.query(api.assets.page, address);
  expect(original?.asset.previewHref).toContain(`/homeworld-cards/${created.id}/card.jpg`);
  const publicationId = await t.run((ctx) =>
    ctx.db.insert('publication_assets', {
      asset_type: 'card-homeworld',
      asset_id: created.id,
      cache_token: 'first-capture',
      published_at: 1,
    })
  );
  const published = await t.query(api.assets.page, address);
  expect(published?.asset.previewHref).toBe(published?.assetPublishing?.publicationHref);
  expect(published?.asset.previewHref).toContain('v=first-capture');

  await t.run((ctx) =>
    ctx.db.patch('publication_assets', publicationId, { cache_token: 'new-renderer', published_at: 2 })
  );
  const recaptured = await t.query(api.assets.page, address);
  expect(recaptured?.asset.updated_at).toBe(original?.asset.updated_at);
  expect(recaptured?.asset.previewHref).toBe(recaptured?.assetPublishing?.publicationHref);
  expect(recaptured?.asset.previewHref).toContain('v=new-renderer');
});
