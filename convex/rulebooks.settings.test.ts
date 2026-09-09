/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import type { RulebookSettings } from '../src/shared/rulebooks/settings';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

const SETTINGS: RulebookSettings[] = [
  { size: 'square', design: 'illustrated' },
  { size: 'square', design: 'restrained' },
  { size: 'a4', design: 'illustrated' },
  { size: 'a4', design: 'restrained' },
  { size: 'tall', design: 'illustrated' },
  { size: 'tall', design: 'restrained' },
];

describe('Rulebook settings', () => {
  test.each(SETTINGS)('creates and reads $size with $design', async (settings) => {
    const { owner, ids } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Chosen manual',
      source: { kind: 'starter', settings },
    });
    expect(created.rulebook.settings).toEqual(settings);
    expect(created.edition.settings).toEqual(settings);
    await expect(
      owner.query(api.rulebooks.readerPage, {
        ruleset_slug: 'rulebook-test-rules',
        rulebook_slug: created.rulebook.slug,
      })
    ).resolves.toMatchObject({ rulebook: { settings }, edition: { settings } });
  });

  test('a clone can choose a Design while the server keeps the source Size', async () => {
    const { owner, ids } = await rulebookFixture();
    const source = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Tall source',
      source: { kind: 'starter', settings: { size: 'tall', design: 'illustrated' } },
    });
    const clone = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Restrained clone',
      source: { kind: 'clone', rulebook_id: source.rulebook._id, design: 'restrained' },
    });
    expect(clone.rulebook.settings).toEqual({ size: 'tall', design: 'restrained' });
    expect(clone.edition.settings).toEqual(clone.rulebook.settings);

    /* A forged client payload must not introduce a cross-Size clone. */
    await expect(
      owner.mutation(api.rulebooks.create, {
        catalogue_version: RULEBOOK_CATALOGUE_VERSION,
        ruleset_id: ids.rulesetId,
        name: 'Forged clone',
        source: { kind: 'clone', rulebook_id: source.rulebook._id, size: 'square' },
      } as never)
    ).rejects.toThrow();
  });

  test('saving and publishing Contents preserve settings captured by every Edition', async () => {
    const { t, owner, ids } = await rulebookFixture();
    const settings: RulebookSettings = { size: 'square', design: 'restrained' };
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Fixed manual',
      source: { kind: 'starter', settings },
    });
    const contents = structuredClone(created.draft.contents) as RulebookContentsV1;
    contents.pagesById[contents.pageOrder[0]].title = 'A revised Page';
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents,
    });
    await owner.mutation(api.rulebooks.publish, {
      rulebook_id: created.rulebook._id,
      expected_revision: 2,
      confirmed: true,
    });
    const editions = await t.run(async (ctx) =>
      ctx.db
        .query('rulebook_editions')
        .withIndex('by_rulebook_and_edition_number', (q) => q.eq('rulebook_id', created.rulebook._id))
        .collect()
    );
    expect(editions.map((edition) => edition.settings)).toEqual([settings, settings]);

    /* Reading an Edition uses its captured settings even if the metadata row changes outside authoring. */
    await t.run(async (ctx) =>
      ctx.db.patch(created.rulebook._id, {
        settings: { size: 'a4', design: 'illustrated' },
      })
    );
    await expect(
      owner.query(api.rulebooks.readerPage, {
        ruleset_slug: 'rulebook-test-rules',
        rulebook_slug: created.rulebook.slug,
        edition_number: 1,
      })
    ).resolves.toMatchObject({ edition: { settings } });
  });

  test('an existing Rulebook rejects settings through the Save boundary', async () => {
    const { owner, ids } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Immutable manual',
      source: { kind: 'starter' },
    });
    await expect(
      owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: 1,
        contents: created.draft.contents,
        settings: { size: 'tall', design: 'restrained' },
      } as never)
    ).rejects.toThrow();
    await expect(
      owner.query(api.rulebooks.editorPage, {
        ruleset_slug: 'rulebook-test-rules',
        rulebook_slug: created.rulebook.slug,
      })
    ).resolves.toMatchObject({
      rulebook: { settings: { size: 'a4', design: 'illustrated' } },
      draft: { revision: 1 },
    });
  });
});
