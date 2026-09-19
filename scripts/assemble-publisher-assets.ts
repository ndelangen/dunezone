import path from 'node:path';

import { writeRendererManifest } from '../workers/publisher/renderer-manifest-build';
import { assemblePublisherAssets, inspectPublisherAssets } from './lib/publisher-assets';

const repositoryRoot = path.resolve(import.meta.dir, '..');
const appDirectory = path.join(repositoryRoot, 'dist/client');
const publisherDirectory = path.join(repositoryRoot, 'workers/publisher/dist');
const headersFile = path.join(repositoryRoot, 'workers/publisher/_headers');
const checkOnly = process.argv.includes('--check-only');
const report = checkOnly
  ? inspectPublisherAssets(publisherDirectory)
  : assemblePublisherAssets(appDirectory, publisherDirectory, headersFile);
const rendererManifest = checkOnly ? undefined : writeRendererManifest(repositoryRoot, publisherDirectory);

console.log(JSON.stringify({ ok: true, ...report, rendererManifest }));
