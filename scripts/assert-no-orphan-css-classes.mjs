/**
 * Fails when a CSS module defines a class nobody uses, or a component reaches for one that does not exist.
 *
 * The orphan half is the one that earns its keep.
 * Inlining a component or swapping it for a kit one drops the
 * `className` and leaves the rule behind, and nothing else notices: the build is clean, the types are clean, the tests pass, and the page quietly loses a sticky panel or a placeholder.
 * That exact mistake shipped three times in one refactor (`.rulesetHeadCover`, `.rulesProof`, `.artifactDesk`) before anyone looked at the CSS.
 *
 * Scoped to the application tree (which contains the interface kit at `src/app/ui`).
 * `src/game` is print-faithful renderers whose stylesheets are kept in step with SVG templates by hand;
 * they carry known orphans that are not safe to delete without comparing rendered output, so they sit outside this check rather than silently failing it.
 * Widen the scope the day that stops being true.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/* Walked rather than shelled out to `git ls-files`: invoking a bare binary resolves it through
   `$PATH`, and everything this needs is under `src/`, which carries nothing ignored. */
function filesUnder(root, extensions) {
  return (
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
      /* `parentPath` is already relative to the cwd, because `root` is, so keep it that way so these
       line up with the specifiers resolved below. */
      .map((entry) => join(entry.parentPath, entry.name))
  );
}

/* `src/app` now contains the interface kit at `src/app/ui`, so one walk covers both. */
const cssFiles = filesUnder('src/app', ['.module.css']);
const sourceFiles = filesUnder('src', ['.ts', '.tsx']);

/**
 * Which source files import each stylesheet, and under what name.
 * The binding is read from the import rather than assumed to be `styles`, because `FactionSheetView` calls its one `sheetPrint`, and guessing the name reports every class in that file as dead.
 */
const importersOf = new Map();
for (const source of sourceFiles) {
  const text = readFileSync(source, 'utf8');
  for (const match of text.matchAll(/import\s+(\w+)\s+from\s+'([^']+\.module\.css)'/g)) {
    const target = resolve(dirname(source), match[2]).slice(process.cwd().length + 1);
    if (!importersOf.has(target)) {
      importersOf.set(target, []);
    }
    importersOf.get(target).push({ file: source, binding: match[1] });
  }
}

/* One static pattern for every `object.prop` and `object['prop']` in a file, filtered by binding
   afterwards, since building a regex per binding would mean interpolating parsed text into a pattern. */
const PROPERTY_ACCESS = /\b(\w+)\s*(?:\.\s*([A-Za-z_]\w*)|\[\s*'([^']+)'\s*\])/g;
/* `styles[expression]` builds a class name at runtime, so no static reading of that file can
   decide which rules are live. Those stylesheets are skipped rather than guessed at. */
const COMPUTED_ACCESS = /\b(\w+)\s*\[\s*[^'\]]/g;

const orphans = [];
const missing = [];
const unimported = [];

for (const cssFile of cssFiles) {
  const css = readFileSync(cssFile, 'utf8');
  const defined = new Set();
  for (const match of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
    /* `:global(.foo)` names something another stylesheet owns, and `url(x.png)` is not a class. */
    const preceding = css.slice(Math.max(0, match.index - 40), match.index);
    if (/:global\([^)]*$/.test(preceding)) {
      continue;
    }
    if (/[\w)'"]$/.test(preceding.slice(-1)) && /^(css|jpe?g|png|svg|webp|woff2?|json|ts|tsx)$/.test(match[1])) {
      continue;
    }
    defined.add(match[1]);
  }

  const importers = importersOf.get(cssFile) ?? [];
  if (importers.length === 0) {
    unimported.push(cssFile);
    continue;
  }

  const used = new Set();
  let computed = false;
  for (const { file, binding } of importers) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(COMPUTED_ACCESS)) {
      if (match[1] === binding) {
        computed = true;
      }
    }
    if (computed) {
      break;
    }
    for (const match of text.matchAll(PROPERTY_ACCESS)) {
      if (match[1] === binding) {
        used.add(match[2] ?? match[3]);
      }
    }
  }
  if (computed) {
    continue;
  }

  for (const name of defined) {
    if (!used.has(name)) {
      orphans.push(`${cssFile}  .${name}`);
    }
  }
  for (const name of used) {
    if (!defined.has(name)) {
      missing.push(`${cssFile}  styles.${name}`);
    }
  }
}

const report = [
  ['Stylesheets nobody imports', unimported],
  ['Classes defined but never used', orphans],
  ['Classes used but never defined', missing],
].filter(([, rows]) => rows.length > 0);

if (report.length === 0) {
  console.log(`CSS modules clean: ${cssFiles.length} stylesheets, no orphans.`);
  process.exit(0);
}

for (const [heading, rows] of report) {
  console.error(`\n${heading} (${rows.length}):`);
  for (const row of rows) {
    console.error(`  ${row}`);
  }
}
console.error(
  '\nDelete the rule, or apply the class the component lost. If a class really is built at ' +
    "runtime, reach for it as styles['name'] so this check can see it."
);
process.exit(1);
