/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

/**
 * Every exchange below was recorded at `2e90071e8ad`, before the two artifact formats shared one module.
 * Convex deploys before the Worker, so for one deploy window the previous Worker reads these answers through its strict schemas, and a body that moves answers 503 for every published Rulebook.
 * A braced name stands for one of the fixture's ids or its timestamp: it is filled in before a request is sent and put back into an answer before the comparison.
 */
const recordedExchanges = [
  {
    route: 'rulebook-html/take-work',
    request: '{"schemaVersion":1}',
    status: 200,
    answer:
      '{"ok":true,"schemaVersion":1,"items":[{"artifactId":"{htmlArtifactId}","document":{"pageOrder":["RULE"],"pagesById":{"RULE":{"anchor":"introduction","controlValues":{},"id":"RULE","layoutId":"single-column","regions":[{"blocks":[{"id":"TEXT","kind":"text","text":""},{"id":"L5ST","items":[{"id":"step-one","text":""}],"kind":"list","style":"numbered"}],"key":"content"}],"showHeading":true,"title":"Introduction"}},"schemaVersion":1,"settings":{"design":"illustrated","size":"a4"}},"editionId":"{editionId}","editionNumber":1,"rulebookId":"{rulebookId}","rulebookName":"Replayed field manual"}]}',
  },
  {
    route: 'rulebook-pdf/take-work',
    request: '{"schemaVersion":1}',
    status: 200,
    answer:
      '{"ok":true,"schemaVersion":1,"items":[{"artifactId":"{pdfArtifactId}","document":{"pageOrder":["RULE"],"pagesById":{"RULE":{"anchor":"introduction","controlValues":{},"id":"RULE","layoutId":"single-column","regions":[{"blocks":[{"id":"TEXT","kind":"text","text":""},{"id":"L5ST","items":[{"id":"step-one","text":""}],"kind":"list","style":"numbered"}],"key":"content"}],"showHeading":true,"title":"Introduction"}},"schemaVersion":1,"settings":{"design":"illustrated","size":"a4"}},"editionCreatedAt":"{editionCreatedAt}","editionId":"{editionId}","editionNumber":1,"rulebookId":"{rulebookId}","rulebookName":"Replayed field manual"}]}',
  },
  {
    route: 'rulebook-html/take-work',
    request: '{"schemaVersion":1,"extra":true}',
    status: 400,
    answer: '{"error":"Invalid publisher request"}',
  },
  {
    route: 'rulebook-pdf/take-work',
    request: '{"schemaVersion":2}',
    status: 400,
    answer: '{"error":"Invalid publisher request"}',
  },
  {
    route: 'rulebook-html/resolve-delivery',
    request: '{"schemaVersion":1,"kind":"latest","rulebookId":"{rulebookId}"}',
    status: 200,
    answer: '{"ok":true,"status":"missing"}',
  },
  {
    route: 'rulebook-html/fail-work',
    request: '{"schemaVersion":1,"artifactId":"{htmlArtifactId}","error":"Renderer rejected the document"}',
    status: 200,
    answer: '{"ok":true,"status":"failed"}',
  },
  {
    route: 'rulebook-html/fail-work',
    request: '{"schemaVersion":1,"artifactId":"{htmlArtifactId}","error":"Later retry must not change the result"}',
    status: 200,
    answer: '{"ok":true,"status":"failed"}',
  },
  {
    route: 'rulebook-html/fail-work',
    request: '{"schemaVersion":1,"artifactId":"{pdfArtifactId}","error":"Wrong format"}',
    status: 200,
    answer: '{"ok":true,"status":"missing"}',
  },
  {
    route: 'rulebook-html/complete-work',
    request: '{"schemaVersion":1,"artifactId":"{htmlArtifactId}"}',
    status: 200,
    answer: '{"ok":true,"status":"ready"}',
  },
  {
    route: 'rulebook-html/complete-work',
    request: '{"schemaVersion":1,"artifactId":"{htmlArtifactId}"}',
    status: 200,
    answer: '{"ok":true,"status":"ready"}',
  },
  {
    route: 'rulebook-html/complete-work',
    request: '{"schemaVersion":1,"artifactId":"not-an-artifact"}',
    status: 400,
    answer: '{"error":"Invalid Rulebook HTML artifact id"}',
  },
  {
    route: 'rulebook-html/fail-work',
    request: '{"schemaVersion":1,"artifactId":"not-an-artifact","error":"Renderer rejected the document"}',
    status: 400,
    answer: '{"error":"Invalid Rulebook HTML artifact id"}',
  },
  {
    route: 'rulebook-html/fail-work',
    request: '{"schemaVersion":1,"artifactId":"{htmlArtifactId}","error":"  "}',
    status: 400,
    answer: '{"error":"Invalid publisher request"}',
  },
  {
    route: 'rulebook-html/resolve-delivery',
    request: '{"schemaVersion":1,"kind":"latest","rulebookId":"{rulebookId}"}',
    status: 200,
    answer: '{"ok":true,"status":"found","editionNumber":1,"key":"rulebooks/{rulebookId}/editions/1/rulebook.html"}',
  },
  {
    route: 'rulebook-html/resolve-delivery',
    request: '{"schemaVersion":1,"kind":"edition","rulebookId":"{rulebookId}","editionNumber":1}',
    status: 200,
    answer: '{"ok":true,"status":"found","editionNumber":1,"key":"rulebooks/{rulebookId}/editions/1/rulebook.html"}',
  },
  {
    route: 'rulebook-html/resolve-delivery',
    request: '{"schemaVersion":1,"kind":"edition","rulebookId":"{rulebookId}","editionNumber":2}',
    status: 200,
    answer: '{"ok":true,"status":"missing"}',
  },
  {
    route: 'rulebook-html/resolve-delivery',
    request: '{"schemaVersion":1,"kind":"latest","rulebookId":"{rulebookId}","editionNumber":1}',
    status: 400,
    answer: '{"error":"Invalid publisher request"}',
  },
  {
    route: 'rulebook-html/resolve-delivery',
    request: '{"schemaVersion":1,"rulebookId":"{rulebookId}"}',
    status: 400,
    answer: '{"error":"Invalid publisher request"}',
  },
  {
    route: 'rulebook-html/resolve-delivery',
    request: '{"schemaVersion":1,"kind":"latest","rulebookId":"missing-rulebook"}',
    status: 200,
    answer: '{"ok":true,"status":"missing"}',
  },
  {
    route: 'rulebook-pdf/resolve-delivery',
    request: '{"schemaVersion":1,"rulebookId":"{rulebookId}","editionNumber":1}',
    status: 200,
    answer: '{"ok":true,"status":"missing"}',
  },
  {
    route: 'rulebook-pdf/complete-work',
    request: '{"schemaVersion":1,"artifactId":"{htmlArtifactId}"}',
    status: 200,
    answer: '{"ok":true,"status":"missing"}',
  },
  {
    route: 'rulebook-pdf/fail-work',
    request: '{"schemaVersion":1,"artifactId":"{pdfArtifactId}","error":"Batch merge rejected the output"}',
    status: 200,
    answer: '{"ok":true,"status":"failed"}',
  },
  {
    route: 'rulebook-pdf/complete-work',
    request: '{"schemaVersion":1,"artifactId":"{pdfArtifactId}"}',
    status: 200,
    answer: '{"ok":true,"status":"ready"}',
  },
  {
    route: 'rulebook-pdf/fail-work',
    request: '{"schemaVersion":1,"artifactId":"{pdfArtifactId}","error":"Late failure"}',
    status: 200,
    answer: '{"ok":true,"status":"ready"}',
  },
  {
    route: 'rulebook-pdf/complete-work',
    request: '{"schemaVersion":1,"artifactId":"not-an-artifact"}',
    status: 400,
    answer: '{"error":"Invalid Rulebook PDF artifact id"}',
  },
  {
    route: 'rulebook-pdf/fail-work',
    request: '{"schemaVersion":1,"artifactId":"not-an-artifact","error":"Late failure"}',
    status: 400,
    answer: '{"error":"Invalid Rulebook PDF artifact id"}',
  },
  {
    route: 'rulebook-pdf/resolve-delivery',
    request: '{"schemaVersion":1,"rulebookId":"{rulebookId}","editionNumber":1}',
    status: 200,
    answer: '{"ok":true,"status":"found","editionNumber":1,"key":"rulebooks/{rulebookId}/editions/1/rulebook.pdf"}',
  },
  {
    route: 'rulebook-pdf/resolve-delivery',
    request: '{"schemaVersion":1,"kind":"edition","rulebookId":"{rulebookId}","editionNumber":1}',
    status: 400,
    answer: '{"error":"Invalid publisher request"}',
  },
  {
    route: 'rulebook-pdf/resolve-delivery',
    request: '{"schemaVersion":1,"rulebookId":"{rulebookId}"}',
    status: 400,
    answer: '{"error":"Invalid publisher request"}',
  },
  {
    route: 'rulebook-html/take-work',
    request: '{"schemaVersion":1}',
    status: 200,
    answer: '{"ok":true,"schemaVersion":1,"items":[]}',
  },
  {
    route: 'rulebook-pdf/take-work',
    request: '{"schemaVersion":1}',
    status: 200,
    answer: '{"ok":true,"schemaVersion":1,"items":[]}',
  },
] as const;

beforeEach(() => {
  vi.stubEnv('ASSET_PUBLISHER_EXECUTOR_SECRET', 'executor-secret');
  vi.stubEnv('ASSET_PUBLISHER_ACTIVATION_SECRET', 'activation-secret');
});
afterEach(() => vi.unstubAllEnvs());

async function replayFixture() {
  const { t, owner, ids } = await rulebookFixture();
  const created = await owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: ids.rulesetId,
    name: 'Replayed field manual',
    source: { kind: 'starter' },
  });
  const artifacts = await t.run(async (ctx) => await ctx.db.query('rulebook_edition_artifacts').collect());
  const artifactId = (kind: 'html' | 'pdf') => {
    const artifact = artifacts.find((candidate) => candidate.kind === kind);
    if (!artifact) {
      throw new Error(`Expected a ${kind} artifact row`);
    }
    return artifact._id;
  };
  const values: Record<string, string> = {
    rulebookId: created.rulebook._id,
    editionId: created.edition._id,
    htmlArtifactId: artifactId('html'),
    pdfArtifactId: artifactId('pdf'),
    editionCreatedAt: created.edition.created_at,
  };
  return {
    fill: (template: string) => template.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? `{${name}}`),
    restore: (answer: string) =>
      Object.entries(values).reduce((text, [name, value]) => text.split(value).join(`{${name}}`), answer),
    post: async (route: string, body: string) =>
      await t.fetch(`/asset-publishing/executor/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer executor-secret' },
        body,
      }),
  };
}

describe('Rulebook artifact executor HTTP boundary', () => {
  test('answers every recorded request with the recorded status and bytes', async () => {
    const { fill, restore, post } = await replayFixture();
    const replayed = [];
    for (const exchange of recordedExchanges) {
      const response = await post(exchange.route, fill(exchange.request));
      replayed.push({ ...exchange, status: response.status, answer: restore(await response.text()) });
    }
    expect(replayed).toEqual(recordedExchanges);
  });
});
