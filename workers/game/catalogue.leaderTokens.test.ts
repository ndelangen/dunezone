import { expect, test, vi } from 'vite-plus/test';

import { DUKE_PRAD_VIDAL_TOKEN } from '../../src/shared/assets/leaderToken';
import { GameCatalogue } from './catalogue';

const reads = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('./gameHttpClient', () => ({ gameHttpClient: () => reads }));

test('a direct standalone leader captures one round token using its single face on either side', async () => {
  const image = '/published/leader-tokens/duke/token.jpg?v=ready';
  reads.query.mockResolvedValue({
    asset: {
      id: 'duke',
      type: 'token-leader',
      slug: 'duke-prad-vidal',
      name: DUKE_PRAD_VIDAL_TOKEN.name,
      data: DUKE_PRAD_VIDAL_TOKEN,
    },
    front: image,
    back: image,
    backMode: 'same',
    backToken: null,
    backDeck: null,
    members: [],
    membersTruncated: false,
  });
  const catalogue = new GameCatalogue('https://example.convex.cloud', 'https://dune.zone');
  const captured = await catalogue.capture({ type: 'token-leader', slug: 'duke-prad-vidal' });
  expect(captured.pieces).toHaveLength(1);
  expect(captured.pieces[0].items).toHaveLength(1);
  expect(captured.pieces[0].items[0].artwork).toMatchObject({
    type: 'token-leader',
    front: 'https://dune.zone/published/leader-tokens/duke/token.jpg',
    back: 'https://dune.zone/published/leader-tokens/duke/token.jpg',
  });
  expect(captured.definitions).toEqual([{ id: 'duke', type: 'token-leader', data: DUKE_PRAD_VIDAL_TOKEN }]);
});
