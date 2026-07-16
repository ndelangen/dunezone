import path from 'node:path';

import { assemblePublisherAssets, inspectPublisherAssets } from './lib/publisher-assets';

const repositoryRoot = path.resolve(import.meta.dir, '..');
const appDirectory = path.join(repositoryRoot, 'dist/client');
const publisherDirectory = path.join(repositoryRoot, 'workers/publisher/dist');
const checkOnly = process.argv.includes('--check-only');
const report = checkOnly
  ? inspectPublisherAssets(publisherDirectory)
  : assemblePublisherAssets(appDirectory, publisherDirectory);

console.log(JSON.stringify({ ok: true, ...report }));
