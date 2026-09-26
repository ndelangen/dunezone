/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { rulebookEditionArtifactKey } from '../src/shared/rulebooks/editionArtifacts';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

describe('Rulebook latest HTML pointer', () => {
  test('latest-ready always selects the highest successful Edition, regardless of completion order', async () => {
    const { t, owner, ids } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'HTML field manual',
      source: { kind: 'starter' },
    });
    const contents = structuredClone(created.draft.contents) as RulebookContentsV1;
    contents.pagesById[contents.pageOrder[0]].title = 'Second Edition';
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
    const artifacts = await t.run(
      async (ctx) =>
        await ctx.db
          .query('rulebook_edition_artifacts')
          .withIndex('by_rulebook_and_kind_and_status_and_edition_number', (q) =>
            q.eq('rulebook_id', created.rulebook._id).eq('kind', 'html').eq('status', 'preparing')
          )
          .collect()
    );
    const editionOne = artifacts.find(({ edition_number }) => edition_number === 1);
    const editionTwo = artifacts.find(({ edition_number }) => edition_number === 2);
    if (!editionOne || !editionTwo) {
      throw new Error('Expected two preparing HTML artifacts');
    }

    await t.mutation(internal.rulebookEditionArtifactWork.complete, {
      artifactKind: 'html',
      artifactId: editionTwo._id,
    });
    await t.mutation(internal.rulebookEditionArtifactWork.complete, {
      artifactKind: 'html',
      artifactId: editionOne._id,
    });

    await expect(
      t.query(internal.rulebookEditionArtifactWork.resolve, { artifactKind: 'html', rulebookId: created.rulebook._id })
    ).resolves.toEqual({
      editionNumber: 2,
      key: rulebookEditionArtifactKey(created.rulebook._id, 2, 'html'),
    });
    await expect(
      t.query(internal.rulebookEditionArtifactWork.resolve, {
        artifactKind: 'html',
        rulebookId: created.rulebook._id,
        editionNumber: 1,
      })
    ).resolves.toEqual({
      editionNumber: 1,
      key: rulebookEditionArtifactKey(created.rulebook._id, 1, 'html'),
    });
  });
});
