/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import type { RulebookSettings } from '../src/shared/rulebooks/settings';
import { api } from './_generated/api';
import { coveringRulebookSettings, rulebookFixture } from './rulebooks.test.fixture';

describe('Rulebook settings', () => {
  test.each(coveringRulebookSettings())('creates and reads $size with $design', async (settings) => {
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

  test('public responses expose selected Edition settings while clone choices retain private saved defaults', async () => {
    const { t, owner, outsider, ids } = await rulebookFixture();
    const published = { size: 'a4', design: 'illustrated' } as const;
    const draft = { size: 'gf9-core', design: 'restrained' } as const;
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Private resize',
      source: { kind: 'starter' },
    });
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents: created.draft.contents,
      settings: draft,
    });
    const locator = { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug };
    const rows = await t.query(api.rulebooks.listByRulesetSlug, { ruleset_slug: locator.ruleset_slug });
    expect(rows[0]).not.toHaveProperty('draft_settings');
    expect(rows[0].settings).toEqual(published);
    for (const response of [
      await t.query(api.rulebooks.readerPage, locator),
      await t.query(api.rulebooks.readerDelivery, locator),
      await t.query(api.rulebooks.editionHistory, locator),
      await t.query(api.rulebooks.editorPage, locator),
      await outsider.query(api.rulebooks.editorPage, locator),
    ]) {
      expect(response).toMatchObject({ rulebook: { settings: published } });
    }
    expect((await t.query(api.rulebooks.creationPage, { ruleset_slug: locator.ruleset_slug }))?.rulebooks).toEqual([]);
    expect(
      (await outsider.query(api.rulebooks.creationPage, { ruleset_slug: locator.ruleset_slug }))?.rulebooks
    ).toEqual([]);
    expect(
      (await owner.query(api.rulebooks.creationPage, { ruleset_slug: locator.ruleset_slug }))?.rulebooks[0]
    ).toMatchObject({ settings: published, draft_settings: draft });
    const clone = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Saved defaults clone',
      source: { kind: 'clone', rulebook_id: created.rulebook._id },
    });
    expect(clone.draft.settings).toEqual(draft);
    await owner.mutation(api.rulebooks.publish, {
      rulebook_id: created.rulebook._id,
      expected_revision: 2,
      confirmed: true,
    });
    for (const query of [api.rulebooks.readerPage, api.rulebooks.readerDelivery]) {
      await expect(t.query(query, { ...locator, edition_number: 1 })).resolves.toMatchObject({
        rulebook: { settings: published },
      });
      await expect(t.query(query, locator)).resolves.toMatchObject({ rulebook: { settings: draft } });
    }
    await t.run(async (ctx) => {
      const first = await ctx.db
        .query('rulebook_editions')
        .withIndex('by_rulebook_and_edition_number', (q) =>
          q.eq('rulebook_id', created.rulebook._id).eq('edition_number', 1)
        )
        .unique();
      await ctx.db.patch(first!._id, { settings: undefined });
    });
    await expect(t.query(api.rulebooks.readerPage, { ...locator, edition_number: 1 })).resolves.toMatchObject({
      rulebook: { settings: published },
      edition: { settings: published },
    });
  });

  test('settings-only Save advances the revision and Publish captures a new authored pair', async () => {
    const { t, owner, ids } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Resized manual',
      source: { kind: 'starter' },
    });
    const settings: RulebookSettings = { size: 'gf9-core', design: 'restrained' };
    const saved = await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents: created.draft.contents,
      settings,
    });
    expect(saved).toMatchObject({ kind: 'saved', draft: { revision: 2, settings, contents: created.draft.contents } });
    expect(saved.draft.contents_hash).toBe(created.draft.contents_hash);
    expect(saved.draft.authored_hash).not.toBe(created.draft.authored_hash);
    const publicListing = () => owner.query(api.rulebooks.listByRulesetSlug, { ruleset_slug: 'rulebook-test-rules' });
    expect((await publicListing()).find((row) => row._id === created.rulebook._id)?.settings).toEqual({
      size: 'a4',
      design: 'illustrated',
    });
    const creation = await owner.query(api.rulebooks.creationPage, { ruleset_slug: 'rulebook-test-rules' });
    expect(creation?.rulebooks.find((row) => row._id === created.rulebook._id)).toMatchObject({
      settings: { size: 'a4', design: 'illustrated' },
      draft_settings: settings,
    });
    const locator = { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug };
    await expect(owner.query(api.rulebooks.editorPage, locator)).resolves.toMatchObject({
      hasUnpublishedChanges: true,
    });
    await expect(
      owner.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 2,
        confirmed: true,
      })
    ).resolves.toMatchObject({ kind: 'published', currentEdition: { edition_number: 2 } });
    await expect(owner.query(api.rulebooks.readerPage, locator)).resolves.toMatchObject({ edition: { settings } });
    expect((await publicListing()).find((row) => row._id === created.rulebook._id)?.settings).toEqual(settings);
    await expect(owner.query(api.rulebooks.readerPage, { ...locator, edition_number: 1 })).resolves.toMatchObject({
      edition: { settings: { size: 'a4', design: 'illustrated' }, contents: created.edition.contents },
    });
    await expect(owner.query(api.rulebooks.editorPage, locator)).resolves.toMatchObject({
      hasUnpublishedChanges: false,
    });
    await expect(
      owner.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 2,
        confirmed: true,
      })
    ).resolves.toMatchObject({ kind: 'unchanged' });
    const stale = await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents: created.draft.contents,
      settings: { size: 'a4', design: 'illustrated' },
    });
    expect(stale).toMatchObject({ kind: 'stale', draft: { revision: 2, settings } });
    const legacy = await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 2,
      contents: saved.draft.contents,
    });
    expect(legacy).toMatchObject({ kind: 'saved', draft: { revision: 3, settings } });
    await t.run(async (ctx) => {
      await ctx.db.patch('rulebook_drafts', saved.draft._id, { authored_hash: undefined });
      const editions = await ctx.db
        .query('rulebook_editions')
        .withIndex('by_rulebook_and_edition_number', (q) => q.eq('rulebook_id', created.rulebook._id))
        .collect();
      for (const edition of editions) {
        await ctx.db.patch('rulebook_editions', edition._id, { authored_hash: undefined });
      }
    });
    await expect(owner.query(api.rulebooks.editorPage, locator)).resolves.toMatchObject({
      hasUnpublishedChanges: false,
    });
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 3,
      contents: saved.draft.contents,
      settings: { size: 'gf9-expansion', design: 'illustrated' },
    });
    await expect(owner.query(api.rulebooks.editorPage, locator)).resolves.toMatchObject({
      hasUnpublishedChanges: true,
    });
  });
});
