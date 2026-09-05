/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { rulebookEditionArtifactKey } from '../src/shared/rulebooks/editionArtifacts';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

describe('Rulebook artifact delivery seam', () => {
  test('deleting the owning Ruleset gates every format without deleting permanent artifacts', async () => {
    const fixture = await rulebookFixture();
    const created = await fixture.owner.mutation(api.rulebooks.create, {
      ruleset_id: fixture.ids.rulesetId,
      name: 'Artifact field manual',
      source: { kind: 'starter' },
    });
    const artifacts = await fixture.t.run(async (ctx) => await ctx.db.query('rulebook_edition_artifacts').collect());
    const html = artifacts.find(({ kind }) => kind === 'html');
    const pdf = artifacts.find(({ kind }) => kind === 'pdf');
    if (!html || !pdf) {
      throw new Error('Expected HTML and PDF artifact rows');
    }

    await fixture.t.mutation(internal.rulebookHtmlPublication.completeHtmlWork, { artifactId: html._id });
    await fixture.t.mutation(internal.rulebookPdfPublication.completePdfWork, {
      artifactId: pdf._id,
    });
    await expect(
      fixture.t.query(internal.rulebookHtmlPublication.resolveHtmlDelivery, {
        rulebookId: created.rulebook._id,
      })
    ).resolves.toEqual({
      editionNumber: 1,
      key: rulebookEditionArtifactKey(created.rulebook._id, 1, 'html'),
    });
    await expect(
      fixture.t.query(internal.rulebookPdfPublication.resolvePdfDelivery, {
        rulebookId: created.rulebook._id,
        editionNumber: 1,
      })
    ).resolves.toEqual({
      editionNumber: 1,
      key: rulebookEditionArtifactKey(created.rulebook._id, 1, 'pdf'),
    });

    await fixture.owner.mutation(api.rulesets.softDelete, {
      id: fixture.ids.rulesetId,
    });

    await expect(
      fixture.t.query(internal.rulebookHtmlPublication.resolveHtmlDelivery, {
        rulebookId: created.rulebook._id,
      })
    ).resolves.toBeNull();
    await expect(
      fixture.t.query(internal.rulebookPdfPublication.resolvePdfDelivery, {
        rulebookId: created.rulebook._id,
        editionNumber: 1,
      })
    ).resolves.toBeNull();
    await expect(
      fixture.t.run(async (ctx) =>
        Promise.all([
          ctx.db.get('rulebook_edition_artifacts', html._id),
          ctx.db.get('rulebook_edition_artifacts', pdf._id),
        ])
      )
    ).resolves.toMatchObject([{ status: 'ready' }, { status: 'ready' }]);
  });
});
