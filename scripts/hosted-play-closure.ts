/*
 * Decides whether a pull request's changed files can reach the hosted play flows (#1598).
 * The `play-closure` action at the start of each hosted shard pipes the list, one file per line (a modified file whose diff deletes no line carries a tab and `only-adds-lines`), into this script, which prints the decision as JSON, writes `run=true` or `run=false` to the step's outputs, and puts the decision in prose on the step summary.
 * Run: `bun scripts/hosted-play-closure.ts < changed-files.txt`
 */
import { appendFileSync, readFileSync } from 'node:fs';

import { decideHostedPlay, parseChangedFiles } from './lib/hosted-play-closure';
import type { ChangedFile } from './lib/hosted-play-closure';

/** The changed files from standard input, or nothing when it cannot be read, which the decision treats as a diff it cannot judge. */
function changedFiles(): ChangedFile[] {
  try {
    return parseChangedFiles(readFileSync(0, 'utf8'));
  } catch {
    return [];
  }
}

const decision = decideHostedPlay(changedFiles());
console.log(JSON.stringify(decision));
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const files = decision.reaching.map((file) => `- \`${file}\``).join('\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Hosted play shards ${decision.run ? 'run' : 'skipped'}\n\n${decision.reason}\n\n${files}\n`
  );
}
