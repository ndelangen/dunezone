import path from 'node:path';

import {
  APPLICATION_ASSET_MANIFEST,
  bootstrapApplicationAssets,
  retainApplicationAssets,
} from './lib/application-assets';
import { inspectPublisherAssets } from './lib/publisher-assets';
import { TransientError, describeError, retryTransient } from './retry-transient';

const origin = 'https://dune.zone';
const directory = path.resolve(import.meta.dir, '../workers/publisher/dist');
const nonce = Date.now();
const RETRY_DELAYS_MS = [2000, 4000, 8000];
/*
 * One transport attempt includes headers and the complete body.
 * A 429, a 5xx or an interrupted transfer can recover within the existing limit;
 * parsing and digest validation happen afterward and never retry.
 */
const request = (pathname: string) =>
  retryTransient(
    async () => {
      let response: Response;
      try {
        response = await fetch(`${origin}/${pathname}?retention=${nonce}`, {
          headers: { 'Cache-Control': 'no-cache' },
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        throw new TransientError(describeError(error));
      }
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        throw new TransientError(`HTTP ${response.status}`);
      }
      if (!response.ok) {
        await response.body?.cancel();
        return { response, bytes: new Uint8Array() };
      }
      try {
        return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
      } catch (error) {
        throw new TransientError(describeError(error), { cause: error });
      }
    },
    { subject: pathname, delaysMs: RETRY_DELAYS_MS }
  );
const readAsset = async (assetPath: string): Promise<Uint8Array> => {
  const { response, bytes } = await request(assetPath);
  if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) {
    throw new Error(`Cannot retain ${assetPath}: HTTP ${response.status} ${response.headers.get('Content-Type')}`);
  }
  return bytes;
};
const { response: manifestResponse, bytes: manifestBytes } = await request(APPLICATION_ASSET_MANIFEST);
let previous: unknown;
let readPrevious = readAsset;
if (!manifestResponse.ok || !manifestResponse.headers.get('Content-Type')?.includes('application/json')) {
  /* Only the first rollout may lack the manifest; later failures must stop the release. */
  const { response: healthResponse, bytes: healthBytes } = await request('__asset-publisher/health');
  if (!healthResponse.ok) {
    throw new Error('Cannot verify the previous application release');
  }
  const health = JSON.parse(new TextDecoder().decode(healthBytes)) as { application?: unknown; ok?: boolean };
  if (health.ok !== true || health.application) {
    throw new Error('The deployed application asset manifest is unavailable');
  }
  const { response: shell, bytes: shellBytes } = await request('_shell.html');
  if (!shell.ok) {
    throw new Error('Cannot read the deployed shell for the first retention run');
  }
  const bootstrap = await bootstrapApplicationAssets(new TextDecoder().decode(shellBytes), readAsset);
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
  previous = JSON.parse(new TextDecoder().decode(manifestBytes));
}
const retained = await retainApplicationAssets(directory, previous, readPrevious);
console.log(JSON.stringify({ retained, ...inspectPublisherAssets(directory) }));
