/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1, RulebookContentsDraftV1 } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

function localIds(contents: RulebookContentsDraftV1) {
  const ids: string[] = [];
  for (const pageId of contents.pageOrder) {
    ids.push(pageId);
    const page = contents.pagesById[pageId];
    for (const blockId of Object.keys(page.blocksById)) {
      ids.push(blockId);
      const block = page.blocksById[blockId];
      if (block.kind === 'repeated-text' || block.kind === 'list') {
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
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
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
      settings: { size: 'a4', design: 'illustrated' },
    });
    expect(created.draft).toMatchObject({
      rulebook_id: created.rulebook._id,
      revision: 1,
    });
    expect(created.edition).toMatchObject({
      rulebook_id: created.rulebook._id,
      edition_number: 1,
      settings: { size: 'a4', design: 'illustrated' },
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
        catalogue_version: RULEBOOK_CATALOGUE_VERSION,
        ruleset_id: ids.rulesetId,
        name: 'Member Manual',
        source: { kind: 'starter' },
      })
    ).resolves.toMatchObject({ rulebook: { name: 'Member Manual' } });
    await expect(
      outsider.mutation(api.rulebooks.create, {
        catalogue_version: RULEBOOK_CATALOGUE_VERSION,
        ruleset_id: ids.rulesetId,
        name: 'Outsider Manual',
        source: { kind: 'starter' },
      })
    ).rejects.toThrow('Not authorized');
  });

  test('clones the current saved Contents with every local identity regenerated', async () => {
    const { ids, owner } = await rulebookFixture();
    const source = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Source Manual',
      source: { kind: 'starter', settings: { size: 'square', design: 'restrained' } },
    });
    const savedContents = structuredClone(source.draft.contents) as RulebookContentsDraftV1;
    const sourcePage = savedContents.pagesById[savedContents.pageOrder[0]];
    sourcePage.title = 'Saved source title';
    const list = sourcePage.blocksById.L5ST;
    if (list.kind !== 'list') {
      throw new Error('Expected the initial numbered list');
    }
    list.itemsById[list.itemOrder[0]].name = 'Choose forces';
    list.itemsById[list.itemOrder[0]].text = 'Choose one group.';
    const saved = await owner.mutation(api.rulebooks.save, {
      rulebook_id: source.rulebook._id,
      expected_revision: 1,
      contents: savedContents,
    });
    expect(saved.kind).toBe('saved');

    const clone = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Cloned Manual',
      source: { kind: 'clone', rulebook_id: source.rulebook._id },
    });

    expect(clone.draft.contents.pagesById[clone.draft.contents.pageOrder[0]].title).toBe('Saved source title');
    const clonedContents = clone.draft.contents as RulebookContentsV1;
    const clonedList = Object.values(clonedContents.pagesById[clonedContents.pageOrder[0]].blocksById).find(
      (block) => block.kind === 'list'
    );
    expect(clonedList).toMatchObject({ style: 'numbered' });
    if (clonedList?.kind !== 'list') {
      throw new Error('Expected a cloned list');
    }
    expect(clonedList.itemsById[clonedList.itemOrder[0]]).toMatchObject({
      name: 'Choose forces',
      text: 'Choose one group.',
    });
    expect(clone.draft.revision).toBe(1);
    expect(clone.rulebook.settings).toEqual({ size: 'square', design: 'restrained' });
    expect(clone.edition.settings).toEqual(clone.rulebook.settings);
    expect(clone.edition.contents).toEqual(clone.draft.contents);
    const sourceIds = new Set(localIds(savedContents));
    expect(localIds(clone.draft.contents).every((id) => !sourceIds.has(id))).toBe(true);
  });

  test('requires current catalogue capability for both starter and clone creation after authorization', async () => {
    const { t, ids, owner, outsider } = await rulebookFixture();
    const sourceBook = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Current source',
      source: { kind: 'starter' },
    });
    for (const source of [
      { kind: 'starter' as const },
      { kind: 'clone' as const, rulebook_id: sourceBook.rulebook._id },
    ]) {
      for (const version of [
        {},
        { catalogue_version: RULEBOOK_CATALOGUE_VERSION - 1 },
        { catalogue_version: RULEBOOK_CATALOGUE_VERSION + 1 },
      ]) {
        const args = { ...version, ruleset_id: ids.rulesetId, name: 'Older caller', source };
        await expect(owner.mutation(api.rulebooks.create, args)).rejects.toThrow('Reload Dune Zone');
        await expect(outsider.mutation(api.rulebooks.create, args)).rejects.toThrow('Not authorized');
      }
    }
    expect(await t.run((ctx) => ctx.db.query('rulebooks').collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query('rulebook_editions').collect())).toHaveLength(1);
  });

  test('refuses a clone source from another Ruleset', async () => {
    const { ids, owner } = await rulebookFixture();
    const source = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Bound Source',
      source: { kind: 'starter' },
    });

    await expect(
      owner.mutation(api.rulebooks.create, {
        catalogue_version: RULEBOOK_CATALOGUE_VERSION,
        ruleset_id: ids.otherRulesetId,
        name: 'Cross-boundary Clone',
        source: { kind: 'clone', rulebook_id: source.rulebook._id },
      })
    ).rejects.toThrow('same Ruleset');
  });
});
