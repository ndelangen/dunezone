/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { rulesetOwner, VALID_ABOUT } from './rulesets.test.fixture';

const UPDATED_ABOUT = 'A revised house ruleset that changes spice income and makes the final turns much quicker.';

describe('Ruleset About', () => {
  test('creates and updates store only the canonical field', async () => {
    const { owner } = await rulesetOwner();
    const ruleset = await owner.mutation(api.rulesets.create, {
      name: 'AboutRuleset',
      about: VALID_ABOUT,
      group_id: null,
      image_cover: null,
    });

    expect(ruleset).toMatchObject({ about: VALID_ABOUT });

    await expect(
      owner.mutation(api.rulesets.update, {
        id: ruleset._id,
        name: 'AboutRuleset',
        about: UPDATED_ABOUT,
      })
    ).resolves.toMatchObject({ about: UPDATED_ABOUT });
  });

  test('an About below the floor is rejected in product language', async () => {
    const { owner } = await rulesetOwner();

    await expect(
      owner.mutation(api.rulesets.create, {
        name: 'ShortRuleset',
        about: 'Too short.',
        group_id: null,
        image_cover: null,
      })
    ).rejects.toThrow(/Ruleset About must be at least 50 characters/);
  });
});
