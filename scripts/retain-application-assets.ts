import path from 'node:path';

import {
  APPLICATION_ASSET_MANIFEST,
  bootstrapApplicationAssets,
  retainApplicationAssets,
} from './lib/application-assets';
import { inspectPublisherAssets } from './lib/publisher-assets';

const origin = 'https://dune.zone';
const directory = path.resolve(import.meta.dir, '../workers/publisher/dist');
const nonce = Date.now();
const request = (pathname: string) =>
  fetch(`${origin}/${pathname}?retention=${nonce}`, {
    headers: { 'Cache-Control': 'no-cache' },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
const readAsset = async (assetPath: string): Promise<Uint8Array> => {
  const response = await request(assetPath);
  if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) {
    throw new Error(`Cannot retain ${assetPath}: HTTP ${response.status} ${response.headers.get('Content-Type')}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};
const manifestResponse = await request(APPLICATION_ASSET_MANIFEST);
let previous: unknown;
let readPrevious = readAsset;
if (!manifestResponse.ok || !manifestResponse.headers.get('Content-Type')?.includes('application/json')) {
  /* Only the first rollout may lack the manifest; later failures must stop the release. */
  const healthResponse = await request('__asset-publisher/health');
  if (!healthResponse.ok) {
    throw new Error('Cannot verify the previous application release');
  }
  const health = (await healthResponse.json()) as { application?: unknown; ok?: boolean };
  if (health.ok !== true || health.application) {
    throw new Error('The deployed application asset manifest is unavailable');
  }
  const shell = await request('_shell.html');
  if (!shell.ok) {
    throw new Error('Cannot read the deployed shell for the first retention run');
  }
  const bootstrap = await bootstrapApplicationAssets(await shell.text(), readAsset);
  previous = bootstrap.manifest;
  readPrevious = async (assetPath) => {
    const bytes = bootstrap.bytes.get(assetPath);
    if (!bytes) {
      throw new Error(`Bootstrap asset missing: ${assetPath}`);
    }
    return bytes;
  };
  console.log(JSON.stringify({ bootstrapped: bootstrap.manifest.files.length }));
} else {
  previous = await manifestResponse.json();
}
const retained = await retainApplicationAssets(directory, previous, readPrevious);
console.log(JSON.stringify({ retained, ...inspectPublisherAssets(directory) }));
