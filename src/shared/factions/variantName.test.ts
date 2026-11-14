import { expect, test } from 'vite-plus/test';

import { nameWithVariant } from './variantName';

test('the variant follows its Faction after a dot, and a Faction without one reads alone', () => {
  expect(nameWithVariant('House Atreides', 'Classic')).toBe('House Atreides · Classic');
  expect(nameWithVariant('Fremen', undefined)).toBe('Fremen');
});
