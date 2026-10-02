import path from 'node:path';

import { APPLICATION_ASSET_MANIFEST, retainApplicationAssets } from './lib/application-assets';
import { inspectPublisherAssets } from './lib/publisher-assets';

const origin = 'https://dune.zone';
const directory = path.resolve(import.meta.dir, '../workers/publisher/dist');
const options = {
  headers: { 'Cache-Control': 'no-cache' },
  redirect: 'error' as const,
  signal: AbortSignal.timeout(120_000),
};
const manifestResponse = await fetch(`${origin}/${APPLICATION_ASSET_MANIFEST}?release=${Date.now()}`, options);
if (!manifestResponse.ok || !manifestResponse.headers.get('Content-Type')?.includes('application/json')) {
  /* Only the first rollout may lack the manifest; later failures must stop the release. */
  const healthResponse = await fetch(`${origin}/__asset-publisher/health`, options);
  if (!healthResponse.ok) {
    throw new Error('Cannot verify the previous application release');
  }
  const health = (await healthResponse.json()) as { application?: unknown; ok?: boolean };
  if (health.ok !== true || health.application) {
    throw new Error('The deployed application asset manifest is unavailable');
  }
  console.log('The previous release predates application asset retention. Starting retention with this release.');
} else {
  const retained = await retainApplicationAssets(directory, await manifestResponse.json(), async (assetPath) => {
    const response = await fetch(`${origin}/${assetPath}`, options);
    if (!response.ok) {
      throw new Error(`Cannot retain ${assetPath}: HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  });
  console.log(JSON.stringify({ retained, ...inspectPublisherAssets(directory) }));
}
