#!/usr/bin/env node
/**
 * Fails if `src/app` grows a top-level entry that is not one of the known roles.
 *
 * The application used to be filed by domain — `src/app/factions/`, `src/app/groups/`, one folder
 * per noun, each holding a `db.ts` and whatever else that domain accumulated. Hoisting the shared
 * validators to `src/shared` and the data modules to `src/app/db` emptied those folders, but three
 * of them survived on a file or two apiece: a projection helper, a date formatter, a one-line type.
 * Folders outlive the scheme that created them, so the set is written down here instead.
 *
 * Adding an entry is a real decision, not a lint fix: say what role it plays, in AGENTS.md, before
 * adding it to this list.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ALLOWED = new Map([
  ['capture', 'publisher capture entry — game-asset glue, see AGENTS.md'],
  ['db', 'the domain data modules, and the only doorway to Convex'],
  ['routeTree.gen.ts', 'generated'],
  ['router.tsx', 'the router instance'],
  ['routes', 'file-based routes; co-located non-route files take the `-` prefix'],
  ['sheet', 'faction sheet document glue — game-asset glue, see AGENTS.md'],
  ['shell', 'the chrome every page sits in'],
  ['styles', 'global stylesheets'],
  ['ui', 'the component kit, filed by category'],
  ['widgets', 'multi-route assemblies; a last resort'],
]);

const appRoot = join(import.meta.dirname, '..', 'src', 'app');
const entries = await readdir(appRoot);
const unexpected = entries.filter((name) => !ALLOWED.has(name));

if (unexpected.length > 0) {
  console.error(
    `Unexpected top-level entries in src/app:\n${unexpected.map((n) => `  - ${n}`).join('\n')}\n\n` +
      `src/app holds one entry per role:\n` +
      [...ALLOWED].map(([name, why]) => `  - ${name} — ${why}`).join('\n') +
      `\n\nA plain module follows the same ladder as a component: one caller means it lives beside ` +
      `that caller, two or more means it belongs to a home named for its concern. If the new entry ` +
      `is genuinely a new role, document it in AGENTS.md and add it to scripts/assert-app-layout.mjs.`
  );
  process.exit(1);
}
