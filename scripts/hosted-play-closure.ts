/*
 * Decides whether a pull request's changed files can reach the hosted play flows (#1598).
 * The `play-closure` action at the start of each hosted shard pipes the list, one file per line, into this script, which prints the decision as JSON, writes `run=true` or `run=false` to the step's outputs, and puts the decision in prose on the step summary.
 * When the art lock or media map changed, the action also puts both versions of each under `ART_BEFORE` and `ART_AFTER`, at its repository path, so new art alone can skip the shards.
 * Run: `bun scripts/hosted-play-closure.ts < changed-files.txt`
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ART_FILES, decideHostedPlay, onlyAddsArt } from './lib/hosted-play-closure';

/** The changed files from standard input, or nothing when it cannot be read, which the decision treats as a diff it cannot judge. */
function changedFiles(): string[] {
  try {
    return readFileSync(0, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/** One version of an art file as `onlyAddsArt` reads it, or undefined when the action left it out or it cannot be read. */
async function artVersion(directory: string | undefined, file: string): Promise<unknown> {
  const path = directory === undefined ? undefined : join(directory, file);
  if (path === undefined || !existsSync(path)) {
    return undefined;
  }
  try {
    return file.endsWith('.json') ? JSON.parse(readFileSync(path, 'utf8')) : { ...(await import(path)) };
  } catch {
    return undefined;
  }
}

const changed = changedFiles();
const versions = await Promise.all(
  ART_FILES.filter((file) => changed.includes(file)).map(async (file) => ({
    file,
    before: await artVersion(process.env.ART_BEFORE, file),
    after: await artVersion(process.env.ART_AFTER, file),
  }))
);
const newArtOnly = new Set(
  versions.filter(({ file, before, after }) => onlyAddsArt(file, before, after)).map(({ file }) => file)
);

const decision = decideHostedPlay(changed, newArtOnly);
console.log(JSON.stringify(decision));
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const files = decision.reaching.map((file) => `- \`${file}\``).join('\n');
  const art = [...newArtOnly].map((file) => `- \`${file}\` only gained new art`).join('\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Hosted play shards ${decision.run ? 'run' : 'skipped'}\n\n${decision.reason}\n\n${files}\n${art}\n`
  );
}
