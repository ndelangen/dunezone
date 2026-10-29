import { expect, test } from 'vite-plus/test';

import { spiceBoardTokenIds } from './spiceCardReferences';

test('the fixed slot joins and deduplicates map dependencies without changing their order', () => {
  const token = { layerId: 'a', asset_id: 'one', x: 1, y: 2, size: 20, rotation: 0 };
  expect(spiceBoardTokenIds(undefined)).toEqual([]);
  expect(spiceBoardTokenIds({ asset_id: 'board', tints: [], tokens: [token], typeToken: { asset_id: 'two' } })).toEqual(
    ['one', 'two']
  );
  expect(spiceBoardTokenIds({ asset_id: 'board', tints: [], tokens: [token], typeToken: { asset_id: 'one' } })).toEqual(
    ['one']
  );
});
