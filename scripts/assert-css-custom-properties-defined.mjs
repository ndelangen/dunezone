/**
 * Fails when the application reads a CSS custom property that nothing defines.
 *
 * An unresolvable `var()` is invisible to every other gate: typecheck, lint, the orphan check and every test stay green while the declaration goes invalid at computed-value time and the page quietly loses a border, an outline or a text colour.
 * That exact mistake shipped once (`login.module.css`, three properties) and nearly shipped twice more in one branch before this scan existed (#927 records all five).
 *
 * Definitions are collected from stylesheets alone.
 * Properties that JavaScript writes at runtime, and properties a third party provides, cannot be seen from here, so they live in the allowlist below with the writer named beside each entry.
 * The list is deliberately explicit rather than derived from scanning `setProperty` calls, and its honesty is the whole design: every entry MASKS reads of its name from this gate, which is the unsafe direction, so an entry earns its place only with a writer that can be grepped to.
 * The review that founded this gate proved the point by finding one entry whose claimed writer never existed, hiding exactly the defect class the gate exists to catch;
 * audit the list against its writers whenever it changes.
 *
 * What a pass certifies is that a definition exists somewhere, not that its rule applies at the read's DOM position;
 * a definition under a selector that never matches the reading element still goes invalid at runtime, and this gate cannot see that.
 *
 * Reads are policed in the application tree like the orphan check beside it: `src/game` keeps print-faithful stylesheets with their own token systems, outside this check for the orphan check's stated reason.
 * Definitions are collected from all of `src`, because a definition anywhere satisfies a read: the faction sheet preview legitimately reads the mounted sheet's own geometry tokens across the boundary, and a defect is a read that NOTHING defines, not a read that crosses a directory.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Prefix entries end with `-`; exact entries do not. The writer is named so renames find this list. */
const PROVIDED_ELSEWHERE = [
  ['--mantine-', 'the Mantine theme runtime'],
  ['--radix-', 'Radix UI primitives'],
  ['--canvas-width', 'CanvasScale, via setProperty'],
  ['--contain-fit-width', 'the contain-fit observer, via setProperty'],
  ['--contain-fit-height', 'the contain-fit observer, via setProperty'],
  ['--scroll-pct', 'the parallax scroll writer, via setProperty'],
  ['--pile-slot', 'the pile layout, via inline style'],
  ['--document-editor-', 'DocumentEditorLayout, via setProperty'],
  ['--editor-plane-width', 'the faction editor plane, via setProperty'],
];

const definitionsRoot = process.env.CSS_VAR_DEFINITIONS_ROOT ?? 'src';
const readsRoot = process.env.CSS_VAR_READS_ROOT ?? 'src/app';

function filesUnder(base, extensions) {
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) => join(entry.parentPath, entry.name));
}

/* A commented-out definition satisfies nothing at runtime, so it satisfies nothing here either. */
const withoutCssComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

const defined = new Set();
for (const file of filesUnder(definitionsRoot, ['.css'])) {
  for (const match of withoutCssComments(readFileSync(file, 'utf8')).matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) {
    defined.add(match[1]);
  }
}

const reads = new Map();
for (const file of filesUnder(readsRoot, ['.css', '.ts', '.tsx'])) {
  for (const match of readFileSync(file, 'utf8').matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g)) {
    const name = match[1];
    if (!reads.has(name)) {
      reads.set(name, []);
    }
    reads.get(name).push(file);
  }
}

const allowed = (name) =>
  PROVIDED_ELSEWHERE.some(([entry]) => (entry.endsWith('-') ? name.startsWith(entry) : name === entry));

const undefinedReads = [...reads.entries()].filter(([name]) => !defined.has(name) && !allowed(name));

if (undefinedReads.length > 0) {
  console.error('CSS custom properties read but never defined:');
  for (const [name, files] of undefinedReads) {
    console.error(`  ${name}`);
    for (const file of new Set(files)) {
      console.error(`    read in ${file}`);
    }
  }
  console.error(
    '\nDefine the property in a stylesheet, or, if JavaScript or a third party writes it, add it to' +
      ' PROVIDED_ELSEWHERE in this script with the writer named.'
  );
  process.exit(1);
}

console.log(`CSS custom properties check passed: every read resolves (${reads.size} names under ${readsRoot}).`);
