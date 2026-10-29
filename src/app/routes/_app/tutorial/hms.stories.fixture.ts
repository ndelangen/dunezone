import { asset, db, ref, refText, SEED_REF_TOKEN } from '@db/storybook';

import hms from './hms.stories.fixture.json';

export const hmsPublished = db((baseline) => {
  baseline.users.push({ $key: 'hms-owner', name: 'P2' });
  baseline.profiles.push({
    user_id: ref('hms-owner'),
    username: 'P2',
    slug: 'p2',
    avatar_url: null,
    account_state: 'active',
    created_at: '2026-01-01T12:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
  });
  baseline.assets.push({
    ...asset({ type: 'token-pointer', data: hms.asset.data }),
    owner_id: ref('hms-owner'),
    group_id: null,
  });
  baseline.publication_assets.push({
    asset_type: 'token-pointer',
    asset_id: refText('asset:token-pointer:hms', SEED_REF_TOKEN),
    cache_token: 'story',
    published_at: Date.parse('2026-01-01T12:00:00.000Z'),
  });
});
