/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import { rulesetOwner, VALID_ABOUT } from './rulesets.test.fixture';

describe('Ruleset battle dialing', () => {
  test('a ruleset stores its choice, a save without one keeps it, and a game reads it from the supply', async () => {
    const { owner } = await rulesetOwner();
    const ruleset = await owner.mutation(api.rulesets.create, {
      name: 'DialingRuleset',
      about: VALID_ABOUT,
      group_id: null,
      image_cover: null,
    });
    expect(ruleset.battle_dialing).toBeUndefined();
    expect(await owner.query(api.playCatalogue.rulesetSupply, { rulesetId: ruleset._id })).toMatchObject({
      battleDialing: null,
    });

    await expect(
      owner.mutation(api.rulesets.update, {
        id: ruleset._id,
        name: 'DialingRuleset',
        about: VALID_ABOUT,
        battle_dialing: 'kiss',
      })
    ).resolves.toMatchObject({ battle_dialing: 'kiss' });
    await expect(
      owner.mutation(api.rulesets.update, { id: ruleset._id, name: 'DialingRuleset', about: VALID_ABOUT })
    ).resolves.toMatchObject({ battle_dialing: 'kiss' });
    expect(await owner.query(api.playCatalogue.rulesetSupply, { rulesetId: ruleset._id })).toMatchObject({
      battleDialing: 'kiss',
    });
  });

  test('refuses a mechanism it does not know', async () => {
    const { owner } = await rulesetOwner();
    const ruleset = await owner.mutation(api.rulesets.create, {
      name: 'UnknownDialing',
      about: VALID_ABOUT,
      group_id: null,
      image_cover: null,
    });
    await expect(
      owner.mutation(api.rulesets.update, {
        id: ruleset._id,
        name: 'UnknownDialing',
        about: VALID_ABOUT,
        battle_dialing: 'classic' as never,
      })
    ).rejects.toThrow();
  });
});
