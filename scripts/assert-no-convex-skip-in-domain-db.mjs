#!/usr/bin/env node
/**
 * Fails if Convex useQuery `"skip"` appears under src/app domain db modules. Prefer mounting a
 * child component that calls useQuery with real args instead.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const appRoot = join(root, 'src', 'app');

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(p);
    } else if (e.isFile() && e.name === 'db.ts') {
      yield p;
    }
  }
}

const offenders = [];
for await (const file of walk(appRoot)) {
  const text = await readFile(file, 'utf8');
  if (text.includes("'skip'") || text.includes('"skip"')) {
    offenders.push(relative(root, file));
  }
}

if (offenders.length > 0) {
  console.error(
    'Convex useQuery skip is banned in domain db files. Offenders:\n',
    offenders.map((p) => `  - ${p}`).join('\n')
  );
  process.exit(1);
}
