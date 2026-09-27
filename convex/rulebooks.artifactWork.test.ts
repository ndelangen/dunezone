/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { rulebookEditionArtifactKey } from '../src/shared/rulebooks/editionArtifacts';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

const formats = [
  { artifactKind: 'html', otherKind: 'pdf' },
  { artifactKind: 'pdf', otherKind: 'html' },
] as const;

async function artifactWorkFixture() {
  const fixture = await rulebookFixture();
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: fixture.ids.rulesetId,
    name: 'Field manual',
    source: { kind: 'starter' },
  });
  const artifacts = await fixture.t.run(async (ctx) => await ctx.db.query('rulebook_edition_artifacts').collect());
  const artifactOf = (kind: 'html' | 'pdf') => {
    const artifact = artifacts.find((candidate) => candidate.kind === kind);
    if (!artifact) {
      throw new Error(`Expected a ${kind} artifact row`);
    }
    return artifact;
  };
  return { ...fixture, created, artifactOf };
}

describe.each(formats)('Rulebook Edition $artifactKind artifact work seam', ({ artifactKind, otherKind }) => {
  test('picks one frozen Edition and projects the validated render document once', async () => {
    const { t, created } = await artifactWorkFixture();
    const items = await t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      editionId: created.edition._id,
      rulebookId: created.rulebook._id,
      editionNumber: 1,
      rulebookName: 'Field manual',
      document: { schemaVersion: 1, pageOrder: created.edition.contents.pageOrder },
    });
    if (artifactKind === 'pdf') {
      expect(items[0]).toHaveProperty('editionCreatedAt', created.edition.created_at);
    } else {
      expect(items[0]).not.toHaveProperty('editionCreatedAt');
    }
  });

  test('a failure leaves the other format preparing, and settlement is idempotent', async () => {
    const { t, artifactOf } = await artifactWorkFixture();
    const artifactId = artifactOf(artifactKind)._id;

    for (const error of ['Renderer rejected the document', 'Later retry must not change the result']) {
      await expect(
        t.mutation(internal.rulebookEditionArtifactWork.fail, { artifactKind, artifactId, error })
      ).resolves.toBe('failed');
    }
    await expect(
      t.run(async (ctx) => ctx.db.get('rulebook_edition_artifacts', artifactOf(otherKind)._id))
    ).resolves.toMatchObject({ status: 'preparing' });
    await expect(
      t.mutation(internal.rulebookEditionArtifactWork.complete, { artifactKind, artifactId: artifactOf(otherKind)._id })
    ).resolves.toBe('missing');

    await expect(t.mutation(internal.rulebookEditionArtifactWork.complete, { artifactKind, artifactId })).resolves.toBe(
      'ready'
    );
    await expect(t.mutation(internal.rulebookEditionArtifactWork.complete, { artifactKind, artifactId })).resolves.toBe(
      'ready'
    );
    await expect(
      t.mutation(internal.rulebookEditionArtifactWork.fail, { artifactKind, artifactId, error: 'Late failure' })
    ).resolves.toBe('ready');
  });

  test('soft deletion gates delivery without removing the ready row', async () => {
    const { t, owner, created, artifactOf } = await artifactWorkFixture();
    const artifactId = artifactOf(artifactKind)._id;
    await t.mutation(internal.rulebookEditionArtifactWork.complete, { artifactKind, artifactId });
    const resolve = () =>
      t.query(internal.rulebookEditionArtifactWork.resolve, {
        artifactKind,
        rulebookId: created.rulebook._id,
        editionNumber: 1,
      });

    await expect(resolve()).resolves.toEqual({
      editionNumber: 1,
      key: rulebookEditionArtifactKey(created.rulebook._id, 1, artifactKind),
    });
    await owner.mutation(api.rulebooks.softDelete, { rulebook_id: created.rulebook._id });
    await expect(resolve()).resolves.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get('rulebook_edition_artifacts', artifactId))).resolves.toMatchObject({
      status: 'ready',
    });
  });
});
