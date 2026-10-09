/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

test('Rulebook collisions stay within a Ruleset and ordinary renames preserve a legacy URL', async () => {
  const { t, owner, ids, seedRulebooks } = await rulebookFixture();
  const [legacyId] = await seedRulebooks([{ name: 'Field Manual', slug: 'field-manual-999' }]);
  expect((await owner.mutation(api.rulebooks.rename, { rulebook_id: legacyId!, name: 'Field Manual!' })).slug).toBe(
    'field-manual-999'
  );
  const create = async (rulesetId: typeof ids.rulesetId, name: string) =>
    await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: rulesetId,
      name,
      source: { kind: 'starter' },
    });
  expect((await create(ids.rulesetId, 'Create')).rulebook.slug).toBe('create-1');
  expect((await create(ids.otherRulesetId, 'Create')).rulebook.slug).toBe('create-1');
  await t.run(async (ctx) => await ctx.db.patch(legacyId!, { is_deleted: true }));
  const created = await create(ids.rulesetId, 'Field Manual');
  expect(created.rulebook.slug).toBe('field-manual');
  expect(
    (await owner.mutation(api.rulebooks.rename, { rulebook_id: created.rulebook._id, name: 'New manual' })).slug
  ).toBe('new-manual');
});
