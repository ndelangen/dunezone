// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import {
  canonicalRulebookCoverControlValues,
  RULEBOOK_CATALOGUE_VERSION,
  rulebookContentsV1Schema,
} from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function legacyCoverFixture() {
  const f = await rulebookFixture();
  const created = await f.owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: f.ids.rulesetId,
    name: 'Legacy footer',
    source: { kind: 'starter' },
  });
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['CVER'],
    pagesById: {
      CVER: {
        id: 'CVER',
        anchor: 'cover',
        title: 'Dreamrules',
        layoutId: 'cover',
        showHeading: true,
        controlValues: {
          cover: {
            subtitle: 'Rules for Arrakis',
            supportingText: '',
            footer: { enabled: true, title: 'Original footer', label: 'House expansion' },
          },
        },
        blocksById: {},
        blockOrderByRegion: {},
      },
    },
  });
  await f.owner.mutation(api.rulebooks.save, {
    rulebook_id: created.rulebook._id,
    expected_revision: 1,
    contents,
  });
  await f.owner.mutation(api.rulebooks.publish, {
    rulebook_id: created.rulebook._id,
    expected_revision: 2,
    confirmed: true,
  });
  const locator = { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug };
  return { ...f, created, contents, locator };
}

describe('Cover footer region compatibility', () => {
  test('saves a separate footer on a legacy Cover while preserving its immutable Edition', async () => {
    const f = await legacyCoverFixture();
    const readerBefore = await f.t.query(api.rulebooks.readerPage, f.locator);
    expect(readerBefore?.edition.contents).toEqual(f.contents);
    expect(await f.owner.query(api.rulebooks.editorPage, f.locator)).toMatchObject({
      kind: 'editable',
      hasUnpublishedChanges: false,
      draft: { contents: f.contents },
    });

    const next = structuredClone(f.contents);
    const page = next.pagesById.CVER;
    if (page.layoutId !== 'cover') {
      throw new Error('Expected the Cover fixture');
    }
    page.controlValues.footer = { enabled: true, title: 'Independent footer', label: 'Updated expansion' };
    const saved = await f.owner.mutation(api.rulebooks.save, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 2,
      contents: next,
    });
    expect(saved).toMatchObject({
      kind: 'saved',
      draft: { revision: 3, contents: { pagesById: { CVER: { controlValues: page.controlValues } } } },
    });
    expect((await f.t.query(api.rulebooks.readerPage, f.locator))?.edition.contents).toEqual(f.contents);
    await f.owner.mutation(api.rulebooks.publish, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 3,
      confirmed: true,
    });
    expect((await f.t.query(api.rulebooks.readerPage, { ...f.locator, edition_number: 2 }))?.edition.contents).toEqual(
      f.contents
    );
    expect((await f.t.query(api.rulebooks.readerPage, f.locator))?.edition.contents).toMatchObject({
      pagesById: { CVER: { controlValues: { footer: { title: 'Independent footer' } } } },
    });
  });

  test('moving an unchanged footer into its region does not create a new Edition and remains cloneable', async () => {
    const f = await legacyCoverFixture();
    const next = structuredClone(f.contents);
    const page = next.pagesById.CVER;
    if (page.layoutId !== 'cover') {
      throw new Error('Expected the Cover fixture');
    }
    page.controlValues = canonicalRulebookCoverControlValues(page.controlValues);
    await f.owner.mutation(api.rulebooks.save, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 2,
      contents: next,
    });
    expect(await f.owner.query(api.rulebooks.editorPage, f.locator)).toMatchObject({ hasUnpublishedChanges: false });
    expect(
      await f.owner.mutation(api.rulebooks.publish, {
        rulebook_id: f.created.rulebook._id,
        expected_revision: 3,
        confirmed: true,
      })
    ).toMatchObject({ kind: 'unchanged' });
    expect((await f.t.query(api.rulebooks.readerPage, f.locator))?.edition.contents).toEqual(f.contents);
    const cloned = await f.owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: f.ids.rulesetId,
      name: 'Footer clone',
      source: { kind: 'clone', rulebook_id: f.created.rulebook._id },
    });
    const cloneContents = rulebookContentsV1Schema.parse(cloned.draft.contents);
    expect(Object.values(cloneContents.pagesById)).toEqual([
      expect.objectContaining({ layoutId: 'cover', controlValues: page.controlValues }),
    ]);
  });
});
