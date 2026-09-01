/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

function localIds(contents: RulebookContentsV1) {
  const ids: string[] = [];
  for (const pageId of contents.pageOrder) {
    ids.push(pageId);
    const page = contents.pagesById[pageId];
    for (const blockId of Object.keys(page.blocksById)) {
      ids.push(blockId);
      const block = page.blocksById[blockId];
      if (block.kind === 'repeated-text') {
        ids.push(...block.itemOrder);
      }
    }
  }
  return ids;
}

describe('Rulebook creation', () => {
  test('creates one saved draft and matching Edition 1 in the same mutation', async () => {
    const { t, ids, owner } = await rulebookFixture();

    const created = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Field Manual',
      source: { kind: 'starter' },
    });

    expect(created.rulebook).toMatchObject({
      ruleset_id: ids.rulesetId,
      name: 'Field Manual',
      slug: 'field-manual',
      sort_order: 0,
      current_edition_number: 1,
      is_deleted: false,
    });
    expect(created.draft).toMatchObject({
      rulebook_id: created.rulebook._id,
      revision: 1,
    });
    expect(created.edition).toMatchObject({
      rulebook_id: created.rulebook._id,
      edition_number: 1,
    });
    expect(created.draft.contents).toEqual(created.edition.contents);

    const rows = await t.run(async (ctx) => ({
      rulebooks: await ctx.db.query('rulebooks').collect(),
      drafts: await ctx.db.query('rulebook_drafts').collect(),
      editions: await ctx.db.query('rulebook_editions').collect(),
      editionContents: await ctx.db.query('rulebook_edition_contents').collect(),
    }));
    expect(rows.rulebooks).toHaveLength(1);
    expect(rows.drafts).toHaveLength(1);
    expect(rows.editions).toHaveLength(1);
    expect(rows.editions[0]).not.toHaveProperty('contents');
    expect(rows.editionContents).toEqual([
      expect.objectContaining({ edition_id: created.edition._id, contents: created.edition.contents }),
    ]);
  });

  test('lets active maintainers create and refuses someone outside the Ruleset group', async () => {
    const { ids, member, outsider } = await rulebookFixture();

    await expect(
      member.mutation(api.rulebooks.create, {
        ruleset_id: ids.rulesetId,
        name: 'Member Manual',
        source: { kind: 'starter' },
      })
    ).resolves.toMatchObject({ rulebook: { name: 'Member Manual' } });
    await expect(
      outsider.mutation(api.rulebooks.create, {
        ruleset_id: ids.rulesetId,
        name: 'Outsider Manual',
        source: { kind: 'starter' },
      })
    ).rejects.toThrow('Not authorized');
  });

  test('clones the current saved Contents with every local identity regenerated', async () => {
    const { ids, owner } = await rulebookFixture();
    const source = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Source Manual',
      source: { kind: 'starter' },
    });
    const savedContents = structuredClone(source.draft.contents) as RulebookContentsV1;
    savedContents.pagesById[savedContents.pageOrder[0]].title = 'Saved source title';
    const saved = await owner.mutation(api.rulebooks.save, {
      rulebook_id: source.rulebook._id,
      expected_revision: 1,
      contents: savedContents,
    });
    expect(saved.kind).toBe('saved');

    const clone = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Cloned Manual',
      source: { kind: 'clone', rulebook_id: source.rulebook._id },
    });

    expect(clone.draft.contents.pagesById[clone.draft.contents.pageOrder[0]].title).toBe('Saved source title');
    expect(clone.draft.revision).toBe(1);
    expect(clone.edition.contents).toEqual(clone.draft.contents);
    const sourceIds = new Set(localIds(savedContents));
    expect(localIds(clone.draft.contents).every((id) => !sourceIds.has(id))).toBe(true);
  });

  test('refuses a clone source from another Ruleset', async () => {
    const { ids, owner } = await rulebookFixture();
    const source = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Bound Source',
      source: { kind: 'starter' },
    });

    await expect(
      owner.mutation(api.rulebooks.create, {
        ruleset_id: ids.otherRulesetId,
        name: 'Cross-boundary Clone',
        source: { kind: 'clone', rulebook_id: source.rulebook._id },
      })
    ).rejects.toThrow('same Ruleset');
  });
});
