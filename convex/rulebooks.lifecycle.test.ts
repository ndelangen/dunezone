/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function lifecycleFixture() {
  const fixture = await rulebookFixture();
  const { ids, owner } = fixture;
  const create = (name: string) =>
    owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name,
      source: { kind: 'starter' },
    });
  return {
    ...fixture,
    create,
  };
}

describe('Rulebook lifecycle', () => {
  test('checks every live Rulebook when deleted rows share its name', async () => {
    const { seedRulebooks, create } = await lifecycleFixture();
    await seedRulebooks(
      Array.from({ length: 25 }, (_, index) => ({
        name: 'Field Manual',
        slug: `deleted-field-manual-${index + 1}`,
        isDeleted: true,
      }))
    );
    await create('Field Manual');

    await expect(create('Field Manual')).rejects.toThrow('Rulebook name already exists');
  });

  test('an active maintainer reorders the complete live list', async () => {
    const { ids, member, create } = await lifecycleFixture();
    const first = await create('First Manual');
    const second = await create('Second Manual');
    const third = await create('Third Manual');

    await expect(
      member.mutation(api.rulebooks.reorder, {
        ruleset_id: ids.rulesetId,
        rulebook_ids: [third.rulebook._id, first.rulebook._id, second.rulebook._id],
      })
    ).resolves.toEqual([third.rulebook._id, first.rulebook._id, second.rulebook._id]);
    const listed = await member.query(api.rulebooks.listByRulesetSlug, {
      ruleset_slug: 'rulebook-test-rules',
    });
    expect(listed.map((rulebook) => rulebook.name)).toEqual(['Third Manual', 'First Manual', 'Second Manual']);

    await expect(
      member.mutation(api.rulebooks.reorder, {
        ruleset_id: ids.rulesetId,
        rulebook_ids: [first.rulebook._id, first.rulebook._id, third.rulebook._id],
      })
    ).rejects.toThrow('exactly once');
  });

  test('lists and reorders more than 500 Rulebooks without truncation', async () => {
    const { ids, owner, seedRulebooks } = await lifecycleFixture();
    const rulebookIds = await seedRulebooks(
      Array.from({ length: 501 }, (_, index) => ({
        name: `Manual ${index + 1}`,
        slug: `manual-${index + 1}`,
      }))
    );
    const reversed = [...rulebookIds].reverse();

    const listed = await owner.query(api.rulebooks.listByRulesetSlug, {
      ruleset_slug: 'rulebook-test-rules',
    });
    expect(listed).toHaveLength(501);
    await expect(
      owner.mutation(api.rulebooks.reorder, {
        ruleset_id: ids.rulesetId,
        rulebook_ids: reversed,
      })
    ).resolves.toEqual(reversed);
    const reordered = await owner.query(api.rulebooks.listByRulesetSlug, {
      ruleset_slug: 'rulebook-test-rules',
    });
    expect(reordered.map((rulebook) => rulebook._id)).toEqual(reversed);
  });

  test('keeps rename and deletion owner-only while reserving a deleted slug', async () => {
    const { ids, owner, member, create } = await lifecycleFixture();
    const created = await create('Field Manual');

    await expect(
      member.mutation(api.rulebooks.rename, {
        rulebook_id: created.rulebook._id,
        name: 'Archive Manual',
      })
    ).rejects.toThrow('Not authorized');
    const renamed = await owner.mutation(api.rulebooks.rename, {
      rulebook_id: created.rulebook._id,
      name: 'Archive Manual',
    });
    expect(renamed).toMatchObject({
      name: 'Archive Manual',
      slug: 'archive-manual',
    });

    await expect(
      member.mutation(api.rulebooks.softDelete, {
        rulebook_id: created.rulebook._id,
      })
    ).rejects.toThrow('Not authorized');
    await owner.mutation(api.rulebooks.softDelete, {
      rulebook_id: created.rulebook._id,
    });

    await expect(
      owner.query(api.rulebooks.editorBySlugs, {
        ruleset_slug: 'rulebook-test-rules',
        rulebook_slug: 'archive-manual',
      })
    ).resolves.toBeNull();
    await expect(
      owner.mutation(api.rulebooks.create, {
        ruleset_id: ids.rulesetId,
        name: 'Clone of deleted',
        source: { kind: 'clone', rulebook_id: created.rulebook._id },
      })
    ).rejects.toThrow('Rulebook not found');

    const replacement = await create('Archive Manual');
    expect(replacement.rulebook.slug).toBe('archive-manual-2');
    const listed = await owner.query(api.rulebooks.listByRulesetSlug, {
      ruleset_slug: 'rulebook-test-rules',
    });
    expect(listed.map((rulebook) => rulebook._id)).toEqual([replacement.rulebook._id]);
  });
});
