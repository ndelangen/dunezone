/*
 * Prints the key of a verify job's inputs at HEAD (see `scripts/lib/ci-job-inputs.ts`) and writes it to the step's outputs as `key`.
 * `.github/actions/prior-pass` runs it before any dependency is installed, so it imports nothing from node_modules.
 * Run: `bun scripts/ci-job-key.ts <job>`
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { isReusableJob, jobKey, parseLsTree } from './lib/ci-job-inputs';

const job = process.argv[2] ?? '';
if (!isReusableJob(job)) {
  console.error(`${job || 'No job'} is not a job scripts/lib/ci-job-inputs.ts names.`);
  process.exit(1);
}
const key = jobKey(job, parseLsTree(execFileSync('git', ['ls-tree', '-r', '-z', 'HEAD'], { encoding: 'utf8' })));
console.log(key);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `key=${key}\n`);
}
