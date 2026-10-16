import { expect, test } from 'vite-plus/test';

import { fitsTintCommand } from './territoryTints';

const tintId = 'tint-6f1c1d2e-9a7b-4c3d-8e5f-0a1b2c3d4e5f';

test('a tint command the table can read fits', () => {
  expect(fitsTintCommand({ kind: 'tint-paint', tintId, territory: 'carthag', name: 'Carthag', painted: true })).toBe(
    true
  );
});

test('a territory ID longer than a tint stores does not fit', () => {
  const territory = 'ffi'.repeat(43);
  expect(fitsTintCommand({ kind: 'tint-paint', tintId, territory, name: 'ﬃ'.repeat(43), painted: true })).toBe(false);
});

test('a preset too long for one message does not fit', () => {
  const territories = Array.from({ length: 71 }, (_, index) => `${'long_territory_name_'.repeat(6)}${index}`);
  expect(
    fitsTintCommand({ kind: 'tint-create', tintId, name: 'Fremen deployment', color: '#2f7fe0', territories })
  ).toBe(false);
});
