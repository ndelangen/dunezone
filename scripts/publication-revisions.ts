import { spawnSync } from 'node:child_process';

import { rendererRevisionsSchema } from '../src/shared/asset-publishing/publication';
import { CHECKED_IN_RENDERER_REVISIONS } from '../src/shared/asset-publishing/renderer-revisions';

const REVISIONS_URL =
  'https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/revisions';

function activationSecret(): string {
  const result = spawnSync(
    'bunx',
    ['convex', 'env', 'get', 'ASSET_PUBLISHER_ACTIVATION_SECRET', '--prod'],
    { encoding: 'utf8', env: process.env }
  );
  if (result.status !== 0) {
    throw new Error('Unable to read the Publication activation secret from Convex');
  }
  const secret = result.stdout.trim();
  if (!secret) throw new Error('Publication activation secret is empty');
  return secret;
}

async function request(body: unknown) {
  const response = await fetch(REVISIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${activationSecret()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(`Publication revision request failed with HTTP ${response.status}`);
  return result;
}

export function changedRendererAssetTypes(storedValue: unknown, checkedInValue: unknown): string[] {
  const stored = rendererRevisionsSchema.parse(storedValue);
  const checkedIn = rendererRevisionsSchema.parse(checkedInValue);
  for (const [assetType, storedRevision] of Object.entries(stored)) {
    const checkedInRevision = checkedIn[assetType];
    if (checkedInRevision === undefined || checkedInRevision < storedRevision) {
      throw new Error(`Checked-in Renderer revision for ${assetType} is behind production`);
    }
  }
  return Object.entries(checkedIn)
    .filter(([assetType, revision]) => revision > (stored[assetType] ?? -1))
    .map(([assetType]) => assetType);
}

async function run() {
  const [command] = process.argv.slice(2);
  if (command === 'initialize') {
    const result = await request({
      schemaVersion: 1,
      operation: 'initialize',
      rendererRevisions: CHECKED_IN_RENDERER_REVISIONS,
    });
    console.log(JSON.stringify(result));
    return;
  }
  if (command === 'activate') {
    const read = (await request({ schemaVersion: 1, operation: 'read' })) as {
      rendererRevisions?: Record<string, number> | null;
    };
    const stored = read.rendererRevisions;
    if (!stored) throw new Error('Publication settings are not initialized');
    const changedAssetTypes = changedRendererAssetTypes(stored, CHECKED_IN_RENDERER_REVISIONS);
    if (changedAssetTypes.length === 0) {
      console.log(JSON.stringify({ ok: true, operation: 'activate', changedAssetTypes: [] }));
      return;
    }
    const result = await request({
      schemaVersion: 1,
      operation: 'activate',
      rendererRevisions: CHECKED_IN_RENDERER_REVISIONS,
    });
    console.log(JSON.stringify(result));
    return;
  }
  throw new Error('Expected command: initialize or activate');
}

if (import.meta.main) await run();
