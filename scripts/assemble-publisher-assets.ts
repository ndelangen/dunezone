import { statSync } from 'node:fs';
import path from 'node:path';

import { writeRendererManifest } from '../workers/publisher/renderer-manifest-build';
import { writeApplicationAssetManifest } from './lib/application-assets';
import { assemblePublisherAssets, inspectPublisherAssets, omitStaticRasters } from './lib/publisher-assets';

const repositoryRoot = path.resolve(import.meta.dir, '..');
const appDirectory = path.join(repositoryRoot, 'dist/client');
const publisherDirectory = path.join(repositoryRoot, 'workers/publisher/dist');
const headersFile = path.join(repositoryRoot, 'workers/publisher/_headers');
const checkOnly = process.argv.includes('--check-only');
/*
 * The production deploy runs this mode after its checks: the release then carries no raster copies, because the deploy publishes every variant to R2 before it goes live (#1888 step 7b).
 * Local and CI Workers have empty buckets, so every other build keeps them.
 */
if (process.argv.includes('--omit-static-rasters')) {
  const omittedRasters = omitStaticRasters(publisherDirectory);
  console.log(JSON.stringify({ ok: true, ...inspectPublisherAssets(publisherDirectory), omittedRasters }));
  process.exit(0);
}
const report = checkOnly
  ? inspectPublisherAssets(publisherDirectory)
  : assemblePublisherAssets(appDirectory, publisherDirectory, headersFile);
if (!statSync(path.join(repositoryRoot, 'dist/server/server.js')).isFile()) {
  throw new Error('Application server build is missing');
}
if (!checkOnly) {
  writeApplicationAssetManifest(publisherDirectory);
}
const rendererManifest = checkOnly ? undefined : writeRendererManifest(repositoryRoot, publisherDirectory);

console.log(JSON.stringify({ ok: true, ...report, rendererManifest }));
