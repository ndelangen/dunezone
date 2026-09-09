// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import type { RulebookContentsDraftV1, RulebookPageDraft } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture, seedLegacyRulebookContents } from './rulebooks.test.fixture';

const widePage: RulebookPageDraft = {
  id: 'W5DE',
  anchor: 'wide',
  title: 'Wide',
  showHeading: true,
  layoutId: 'wide-narrow',
  controlValues: { widePosition: 'right' },
  blockOrderByRegion: { wide: [], narrow: [] },
  blocksById: {},
};
const bandPage: RulebookPageDraft = {
  id: 'BAND',
  anchor: 'band',
  title: 'Band',
  showHeading: true,
  layoutId: 'band-columns',
  controlValues: { bandPosition: 'bottom' },
  blockOrderByRegion: { band: [], column1: [], column2: [] },
  blocksById: {},
};

function addPage(contents: RulebookContentsDraftV1, page: RulebookPageDraft) {
  return {
    ...contents,
    pageOrder: [...contents.pageOrder, page.id],
    pagesById: { ...contents.pagesById, [page.id]: page },
  };
}

describe('Rulebook Page creation and fixed layout settings', () => {
  test('saves supported new Pages while retaining creation arrangements and editable headings', async () => {
    const { ids, owner } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Page layouts',
      source: { kind: 'starter' },
    });
    const next = addPage(addPage(created.draft.contents, widePage), bandPage);
    const saved = await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents: next,
    });
    expect(saved).toMatchObject({ kind: 'saved', draft: { revision: 2 } });
    if (saved.kind !== 'saved') {
      throw new Error('Expected new Pages to save');
    }

    const edited = structuredClone(saved.draft.contents);
    const wide = edited.pagesById.W5DE;
    if (wide.layoutId !== 'wide-narrow') {
      throw new Error('Expected a wide Page');
    }
    wide.title = 'New title';
    wide.anchor = 'new-title';
    wide.showHeading = false;
    edited.pageOrder.reverse();
    expect(
      await owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: 2,
        contents: edited,
      })
    ).toMatchObject({ kind: 'saved', draft: { revision: 3, contents: edited } });

    for (const id of ['W5DE', 'BAND']) {
      const forged = structuredClone(edited);
      const page = forged.pagesById[id];
      if (page.layoutId === 'wide-narrow') {
        page.controlValues.widePosition = 'left';
      }
      if (page.layoutId === 'band-columns') {
        page.controlValues.bandPosition = 'top';
      }
      await expect(
        owner.mutation(api.rulebooks.save, {
          rulebook_id: created.rulebook._id,
          expected_revision: 3,
          contents: forged,
        })
      ).rejects.toThrow('position is fixed');
    }
    const forged = structuredClone(edited);
    forged.pagesById.RULE = {
      id: 'RULE',
      anchor: 'introduction',
      title: '',
      showHeading: true,
      layoutId: 'cover',
      controlValues: { cover: { subtitle: '', supportingText: '' } },
      blockOrderByRegion: {},
      blocksById: {},
    };
    await expect(
      owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: 3,
        contents: forged,
      })
    ).rejects.toThrow('layout is fixed');
    const final = await owner.query(api.rulebooks.editorPage, {
      ruleset_slug: 'rulebook-test-rules',
      rulebook_slug: created.rulebook.slug,
    });
    expect(final).toMatchObject({ kind: 'editable', draft: { revision: 3, contents: edited } });
  });

  test('rejects a valid grid unsupported by Tall and accepts a Cover with blank details', async () => {
    const { ids, owner } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Tall pages',
      source: { kind: 'starter', settings: { size: 'tall', design: 'illustrated' } },
    });
    await expect(
      owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: 1,
        contents: addPage(created.draft.contents, widePage),
      })
    ).rejects.toThrow('layout supported by this Rulebook size');
    const contents = addPage(created.draft.contents, {
      id: 'CVVR',
      anchor: 'cover',
      title: '',
      showHeading: true,
      layoutId: 'cover',
      controlValues: { cover: { subtitle: '', supportingText: '' } },
      blockOrderByRegion: {},
      blocksById: {},
    });
    await expect(
      owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: 1,
        contents,
      })
    ).resolves.toMatchObject({ kind: 'saved', draft: { revision: 2, contents } });
  });

  test('keeps existing legacy Pages editable but refuses new identities with a retired layout', async () => {
    const { t, ids, owner } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Existing manual',
      source: { kind: 'starter' },
    });
    const legacy = await seedLegacyRulebookContents(t, created);
    legacy.pagesById.CHAP.title = 'Updated introduction';
    await expect(
      owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: 1,
        contents: legacy,
      })
    ).resolves.toMatchObject({ kind: 'saved', draft: { revision: 2 } });
    const newLegacyPage = { ...legacy.pagesById.CHAP, id: 'NEWP', anchor: 'another-introduction' };
    await expect(
      owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: 2,
        contents: addPage(legacy, newLegacyPage),
      })
    ).rejects.toThrow('layout supported by this Rulebook size');
  });
});
