import { statSync } from 'node:fs';
import path from 'node:path';

import { writeRendererManifest } from '../workers/publisher/renderer-manifest-build';
import { writeApplicationAssetManifest } from './lib/application-assets';
import { assemblePublisherAssets, inspectPublisherAssets } from './lib/publisher-assets';

const repositoryRoot = path.resolve(import.meta.dir, '..');
const appDirectory = path.join(repositoryRoot, 'dist/client');
const publisherDirectory = path.join(repositoryRoot, 'workers/publisher/dist');
const headersFile = path.join(repositoryRoot, 'workers/publisher/_headers');
const checkOnly = process.argv.includes('--check-only');
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
