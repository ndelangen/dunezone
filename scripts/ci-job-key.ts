/*
 * Prints the key of a verify job's inputs (see `scripts/lib/ci-job-inputs.ts`) from the tree listing on standard input, and writes it to the step's outputs as `key`.
 * `.github/actions/prior-pass` runs it before any dependency is installed, so it imports nothing from node_modules.
 * Run: `git ls-tree -r -z HEAD | bun scripts/ci-job-key.ts <job>`
 */
import { appendFileSync, readFileSync } from 'node:fs';

import { isReusableJob, jobKey, parseLsTree } from './lib/ci-job-inputs';

const job = process.argv[2] ?? '';
if (!isReusableJob(job)) {
  console.error(`${job || 'No job'} is not a job scripts/lib/ci-job-inputs.ts names.`);
  process.exit(1);
}
const listing = readFileSync(0, 'utf8');
if (listing.length === 0) {
  console.error('No tree listing on standard input; pipe `git ls-tree -r -z HEAD` into this script.');
  process.exit(1);
}
const key = jobKey(job, parseLsTree(listing));
console.log(key);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `key=${key}\n`);
}
