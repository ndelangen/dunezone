/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { rulesetOwner, VALID_ABOUT } from './rulesets.test.fixture';

describe('Ruleset naming', () => {
  test('a name with spaces is accepted and its slug is derived from it', async () => {
    const { owner } = await rulesetOwner();
    const ruleset = await owner.mutation(api.rulesets.create, {
      name: 'Test Ruleset',
      about: VALID_ABOUT,
      group_id: null,
      image_cover: null,
    });
    expect(ruleset).toMatchObject({ name: 'Test Ruleset', slug: 'test-ruleset' });

    const again = await owner.mutation(api.rulesets.create, {
      name: 'Test  Ruleset!',
      about: VALID_ABOUT,
      group_id: null,
      image_cover: null,
    });
    expect(again.slug).toBe('test-ruleset-1');
  });

  test('reserved paths, deleted holders and legacy suffixes survive ordinary saves', async () => {
    const { t, owner } = await rulesetOwner();
    const create = async (name: string) =>
      await owner.mutation(api.rulesets.create, {
        name,
        about: VALID_ABOUT,
        group_id: null,
        image_cover: null,
      });
    expect((await create('Create')).slug).toBe('create-1');
    const holder = await create('Legacy rules');
    await owner.mutation(api.rulesets.softDelete, { id: holder._id });
    const copy = await create('Legacy rules');
    expect(copy.slug).toBe('legacy-rules-1');
    await t.run(async (ctx) => await ctx.db.patch(copy._id, { slug: 'legacy-rules-deadbeef' }));
    const saved = await owner.mutation(api.rulesets.update, {
      id: copy._id,
      name: 'Legacy rules!',
      about: VALID_ABOUT,
    });
    expect(saved.slug).toBe('legacy-rules-deadbeef');
    expect(
      (
        await owner.mutation(api.rulesets.update, {
          id: copy._id,
          name: 'Fresh rules',
          about: VALID_ABOUT,
        })
      ).slug
    ).toBe('fresh-rules');
  });

  test('a blank name is refused in product language', async () => {
    const { owner } = await rulesetOwner();
    await expect(
      owner.mutation(api.rulesets.create, { name: '   ', about: VALID_ABOUT, group_id: null, image_cover: null })
    ).rejects.toThrow(/Ruleset name is required because it determines the ruleset URL/);
  });
});
