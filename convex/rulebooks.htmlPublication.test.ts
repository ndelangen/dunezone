/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { rulebookEditionArtifactKey } from '../src/shared/rulebooks/editionArtifacts';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function htmlPublicationFixture() {
  const fixture = await rulebookFixture();
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    ruleset_id: fixture.ids.rulesetId,
    name: 'HTML field manual',
    source: { kind: 'starter' },
  });
  return { ...fixture, created };
}

describe('Rulebook HTML Publication seam', () => {
  test('picks one frozen Edition and projects the validated render document once', async () => {
    const { t, created } = await htmlPublicationFixture();
    const items = await t.mutation(internal.rulebookHtmlPublication.takeHtmlWork, {});

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      editionId: created.edition._id,
      rulebookId: created.rulebook._id,
      editionNumber: 1,
      rulebookName: 'HTML field manual',
      document: {
        schemaVersion: 1,
        pageOrder: created.edition.contents.pageOrder,
      },
    });
  });

  test('latest-ready always selects the highest successful Edition, regardless of completion order', async () => {
    const { t, owner, created } = await htmlPublicationFixture();
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

    await t.mutation(internal.rulebookHtmlPublication.completeHtmlWork, { artifactId: editionTwo._id });
    await t.mutation(internal.rulebookHtmlPublication.completeHtmlWork, { artifactId: editionOne._id });

    await expect(
      t.query(internal.rulebookHtmlPublication.resolveHtmlDelivery, { rulebookId: created.rulebook._id })
    ).resolves.toEqual({
      editionNumber: 2,
      key: rulebookEditionArtifactKey(created.rulebook._id, 2, 'html'),
    });
    await expect(
      t.query(internal.rulebookHtmlPublication.resolveHtmlDelivery, {
        rulebookId: created.rulebook._id,
        editionNumber: 1,
      })
    ).resolves.toEqual({
      editionNumber: 1,
      key: rulebookEditionArtifactKey(created.rulebook._id, 1, 'html'),
    });
  });

  test('failure is independent and soft deletion gates delivery without removing artifact state', async () => {
    const { t, owner, created } = await htmlPublicationFixture();
    const artifacts = await t.run(async (ctx) => await ctx.db.query('rulebook_edition_artifacts').collect());
    const html = artifacts.find(({ kind }) => kind === 'html');
    const pdf = artifacts.find(({ kind }) => kind === 'pdf');
    if (!html || !pdf) {
      throw new Error('Expected HTML and PDF artifact rows');
    }

    await expect(
      t.mutation(internal.rulebookHtmlPublication.failHtmlWork, {
        artifactId: html._id,
        error: 'Renderer rejected the document',
      })
    ).resolves.toBe('failed');
    await expect(t.run(async (ctx) => ctx.db.get('rulebook_edition_artifacts', pdf._id))).resolves.toMatchObject({
      status: 'preparing',
    });

    await t.run(async (ctx) => {
      await ctx.db.patch('rulebook_edition_artifacts', html._id, {
        status: 'ready',
        failure_reason: null,
      });
    });
    await owner.mutation(api.rulebooks.softDelete, { rulebook_id: created.rulebook._id });
    await expect(
      t.query(internal.rulebookHtmlPublication.resolveHtmlDelivery, { rulebookId: created.rulebook._id })
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get('rulebook_edition_artifacts', html._id))).resolves.toMatchObject({
      status: 'ready',
    });
  });
});
