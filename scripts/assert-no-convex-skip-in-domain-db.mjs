#!/usr/bin/env node
/**
 * Fails if Convex useQuery `"skip"` appears in a domain data module. Prefer mounting a child
 * component that calls useQuery with real args instead.
 *
 * Scans `src/app/db`, where every domain module lives. It used to hunt the whole app tree for files
 * named `db.ts`, which was the only way to find them while each sat in a folder of its own.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const dbRoot = join(root, 'src', 'app', 'db');

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(p);
    } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.includes('.test.')) {
      yield p;
    }
  }
}

const offenders = [];
for await (const file of walk(dbRoot)) {
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
