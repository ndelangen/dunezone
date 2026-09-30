/*
 * Decides whether a pull request's changed files can reach the hosted play flows (#1598).
 * The verify workflow's `play_closure` job passes the file that lists them and reads the JSON line this prints; the step summary gets the same decision in prose.
 * Run: `bun scripts/hosted-play-closure.ts changed-files.txt`
 */
import { appendFileSync, readFileSync } from 'node:fs';

import { decideHostedPlay } from './lib/hosted-play-closure';

/** The changed files, or nothing when the list cannot be read, which the decision treats as a diff it cannot judge. */
function changedFiles(listPath: string | undefined): string[] {
  if (!listPath) {
    return [];
  }
  try {
    return readFileSync(listPath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

const decision = decideHostedPlay(changedFiles(process.argv[2]));
console.log(JSON.stringify(decision));
if (process.env.GITHUB_STEP_SUMMARY) {
  const files = decision.reaching.map((file) => `- \`${file}\``).join('\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Hosted play shards ${decision.run ? 'run' : 'skipped'}\n\n${decision.reason}\n\n${files}\n`
  );
}
