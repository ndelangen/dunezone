import { expect, test } from 'vite-plus/test';

import type { CreatableRulesetPreview } from '@db/play';

import { offeredSpiceExtras } from './offeredSpiceExtras';

test('a ticked extra spice deck the ruleset stopped offering is left out of the request (#2986)', () => {
  const preview = { spiceExtras: [{ id: 'expansion', name: 'Expansion' }] } as unknown as CreatableRulesetPreview;
  expect(offeredSpiceExtras(['expansion', 'removed'], preview)).toEqual(['expansion']);
  expect(offeredSpiceExtras(['expansion'], null)).toEqual([]);
});
