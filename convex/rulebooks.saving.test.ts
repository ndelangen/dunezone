/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function savingFixture() {
  const fixture = await rulebookFixture();
  const { ids, owner } = fixture;
  const created = await owner.mutation(api.rulebooks.create, {
    ruleset_id: ids.rulesetId,
    name: 'Revision Manual',
    source: { kind: 'starter' },
  });
  return {
    ...fixture,
    created,
  };
}

function withFirstPageTitle(contents: RulebookContentsV1, title: string) {
  const changed = structuredClone(contents);
  changed.pagesById[changed.pageOrder[0]].title = title;
  return changed;
}

describe('Rulebook saving', () => {
  test('an active maintainer advances the revision without changing Edition 1', async () => {
    const { t, ids, member, created } = await savingFixture();
    const contents = withFirstPageTitle(created.draft.contents as RulebookContentsV1, 'Maintainer draft');

    const result = await member.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents,
    });

    expect(result).toMatchObject({
      kind: 'saved',
      draft: { revision: 2, updated_by: ids.memberId, contents },
    });
    const rows = await t.run(async (ctx) => ({
      editions: await ctx.db.query('rulebook_editions').collect(),
      contents: await ctx.db.query('rulebook_edition_contents').collect(),
    }));
    expect(rows.editions).toHaveLength(1);
    expect(rows.editions[0]).not.toHaveProperty('contents');
    expect(rows.contents).toEqual([expect.objectContaining({ contents: created.edition.contents })]);
  });

  test('a stale Save returns the latest saved draft and writes nothing', async () => {
    const { t, owner, member, created } = await savingFixture();
    const latest = withFirstPageTitle(created.draft.contents as RulebookContentsV1, 'Latest saved title');
    await member.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents: latest,
    });
    const staleAttempt = withFirstPageTitle(created.draft.contents as RulebookContentsV1, 'Stale title');

    const result = await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents: staleAttempt,
    });

    expect(result).toMatchObject({
      kind: 'stale',
      draft: { revision: 2, contents: latest },
    });
    const drafts = await t.run(async (ctx) => await ctx.db.query('rulebook_drafts').collect());
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ revision: 2, contents: latest });
  });

  test('refuses invalid Contents and viewers outside the maintaining group', async () => {
    const { t, outsider, owner, created } = await savingFixture();

    await expect(
      owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: 1,
        contents: {},
      })
    ).rejects.toThrow('Invalid');
    await expect(
      outsider.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: 1,
        contents: created.draft.contents,
      })
    ).rejects.toThrow('Not authorized');

    const drafts = await t.run(async (ctx) => await ctx.db.query('rulebook_drafts').collect());
    expect(drafts).toHaveLength(1);
    expect(drafts[0].revision).toBe(1);
  });
});
