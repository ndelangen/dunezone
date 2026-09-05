/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { rulebookEditionArtifactKey } from '../src/shared/rulebooks/editionArtifacts';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function pdfPublicationFixture() {
  const fixture = await rulebookFixture();
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    ruleset_id: fixture.ids.rulesetId,
    name: 'PDF field manual',
    source: { kind: 'starter' },
  });
  return { ...fixture, created };
}

describe('Rulebook PDF Publication seam', () => {
  test('picks one preparing PDF and returns one frozen render document', async () => {
    const { t, created } = await pdfPublicationFixture();
    const items = await t.mutation(internal.rulebookPdfPublication.takePdfWork, {});

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      editionId: created.edition._id,
      rulebookId: created.rulebook._id,
      editionNumber: 1,
      rulebookName: 'PDF field manual',
      document: {
        schemaVersion: 1,
        pageOrder: created.edition.contents.pageOrder,
      },
    });
  });

  test('PDF failure leaves HTML preparing and retry settlement is idempotent', async () => {
    const { t, created } = await pdfPublicationFixture();
    const artifacts = await t.run(async (ctx) => await ctx.db.query('rulebook_edition_artifacts').collect());
    const html = artifacts.find(({ kind }) => kind === 'html');
    const pdf = artifacts.find(({ kind }) => kind === 'pdf');
    if (!html || !pdf) {
      throw new Error('Expected HTML and PDF artifact rows');
    }

    await expect(
      t.mutation(internal.rulebookPdfPublication.failPdfWork, {
        artifactId: pdf._id,
        error: 'Batch merge rejected the output',
      })
    ).resolves.toBe('failed');
    await expect(
      t.mutation(internal.rulebookPdfPublication.failPdfWork, {
        artifactId: pdf._id,
        error: 'Later retry must not change the result',
      })
    ).resolves.toBe('failed');
    await expect(t.run(async (ctx) => ctx.db.get('rulebook_edition_artifacts', html._id))).resolves.toMatchObject({
      status: 'preparing',
    });

    await t.run(async (ctx) => {
      await ctx.db.patch('rulebook_edition_artifacts', pdf._id, {
        status: 'preparing',
        failure_reason: null,
      });
    });
    await expect(
      t.mutation(internal.rulebookPdfPublication.completePdfWork, {
        artifactId: pdf._id,
      })
    ).resolves.toBe('ready');
    await expect(
      t.mutation(internal.rulebookPdfPublication.completePdfWork, {
        artifactId: pdf._id,
      })
    ).resolves.toBe('ready');
    await expect(
      t.query(internal.rulebookPdfPublication.resolvePdfDelivery, {
        rulebookId: created.rulebook._id,
        editionNumber: 1,
      })
    ).resolves.toEqual({
      editionNumber: 1,
      key: rulebookEditionArtifactKey(created.rulebook._id, 1, 'pdf'),
    });
  });

  test('soft deletion gates delivery without deleting the ready PDF row', async () => {
    const { t, owner, created } = await pdfPublicationFixture();
    const pdf = await t.run(
      async (ctx) =>
        await ctx.db
          .query('rulebook_edition_artifacts')
          .withIndex('by_rulebook_and_kind_and_status_and_edition_number', (q) =>
            q
              .eq('rulebook_id', created.rulebook._id)
              .eq('kind', 'pdf')
              .eq('status', 'preparing')
              .eq('edition_number', 1)
          )
          .unique()
    );
    if (!pdf) {
      throw new Error('Expected PDF artifact row');
    }
    await t.mutation(internal.rulebookPdfPublication.completePdfWork, {
      artifactId: pdf._id,
    });
    await owner.mutation(api.rulebooks.softDelete, {
      rulebook_id: created.rulebook._id,
    });

    await expect(
      t.query(internal.rulebookPdfPublication.resolvePdfDelivery, {
        rulebookId: created.rulebook._id,
        editionNumber: 1,
      })
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get('rulebook_edition_artifacts', pdf._id))).resolves.toMatchObject({
      status: 'ready',
    });
  });
});
