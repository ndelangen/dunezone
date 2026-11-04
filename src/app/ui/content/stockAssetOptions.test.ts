import { expect, test } from 'vite-plus/test';

import { stockAssetOptions } from './stockAssetOptions';

const values = (paths: string[]) => stockAssetOptions(paths).map((option) => option.value);

test('a retired duplicate gives way to its original when the picker offers both', () => {
  expect(values(['/vector/decal/barge.svg', '/vector/generic/barge.svg'])).toEqual(['/vector/generic/barge.svg']);
});

test('a retired duplicate stays when its original is not on offer', () => {
  expect(values(['/vector/decal/barge.svg'])).toEqual(['/vector/decal/barge.svg']);
});
