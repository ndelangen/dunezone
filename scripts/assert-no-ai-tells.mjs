#!/usr/bin/env node
/**
 * Fails when developer-facing prose carries an AI tell.
 * Covers the text oxlint cannot reach: markdown, CSS and YAML comments, and `.oxlintrc.json`.
 * Code comments in TS, TSX and MJS are guarded by `local/no-ai-tells` in
 * `scripts/oxlint-local-plugin.mjs`, which reads comment tokens off the AST.
 *
 * Product copy is out of scope and stays reachable only through source files this scan never opens.
 * CSS and YAML are scanned as raw text rather than parsed, because every em dash in both today sits in a comment and the one CSS `content` string in the repo is a space.
 * `scripts/` is scanned for emoji alone: its strings are CLI output a developer reads, and nothing user-facing ships from there.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const root = join(import.meta.dirname, '..');

/* Vendored skills and generated output are not ours to rewrite; a reinstall would undo the sweep. */
const EXCLUDED_PATHS = [
  '.agents',
  '.claude',
  '.git',
  '.temp',
  '.wrangler',
  'convex/_generated',
  'coverage',
  'dist',
  'docs/research',
  'node_modules',
  'playwright-report',
  'storybook-static',
  'test-results',
];

const EM_DASH = '—';
const CURLY_QUOTES = /[‘’“”]/;

/**
 * Words that say nothing the sentence did not already say.
 * Only the first had live hits when this landed;
 * the rest keep the class shut rather than catch anything.
 * Words with an ordinary technical use are deliberately absent, because a guard that cries wolf gets switched off.
 * The list is quoted nowhere else in prose, since this rule reads its own file too.
 */
const FILLER =
  /\b(?:simply|seamless(?:ly)?|delves?|crucial(?:ly)?|essentially|basically|holistic|streamlines?|utiliz(?:e|es|ing))\b/i;

const HEDGE = /\b(?:it (?:is|'s) (?:important|worth) (?:to note|noting)|note that)\b/i;

/* Dingbats, symbols and pictographs. Arrows and typographic marks stay legal. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

/**
 * Names that keep their capital mid-heading.
 * Add a name here when the guard flags a real proper noun;
 * that is the intended way to teach it.
 */
const PROPER_NOUNS = new Set([
  'Arrakis',
  'Blocks',
  'Bun',
  'Cloudflare',
  'Codecov',
  'Content',
  'Controls',
  'Convex',
  'Docker',
  'Dune',
  'GitHub',
  'Group',
  'Groups',
  'JavaScript',
  'Layout',
  'Layouts',
  'Lists',
  'Mantine',
  'Node',
  'Pickers',
  'Playwright',
  'React',
  'Storybook',
  'Surface',
  'Surfaces',
  'TanStack',
  'TypeScript',
  'Vite',
  'Vitest',
  'Widgets',
  'Wrangler',
  'Zod',
  'Zone',
]);

const LETTER = /[A-Za-z]/;

/* Product names whose second word is capitalised by the vendor, not by us. */
const PROPER_PHRASES = ['Convex Auth', 'GitHub Action', 'Floating UI', 'Dune Zone', 'Test Analytics'];

function isExcluded(relativePath) {
  return EXCLUDED_PATHS.some((excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}/`));
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(sep).join('/');
    if (isExcluded(rel)) {
      continue;
    }
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield { full, rel };
    }
  }
}

/**
 * Which checks a file gets, by what the file is.
 * `null` means the scan skips it.
 */
function checksFor(rel) {
  if (rel.endsWith('.md')) {
    return { prose: true, headings: true, emoji: true };
  }
  if (rel === '.oxlintrc.json' || rel.endsWith('.css') || rel.endsWith('.yml') || rel.endsWith('.yaml')) {
    return { prose: true, headings: false, emoji: true };
  }
  if (rel.startsWith('scripts/') && (rel.endsWith('.ts') || rel.endsWith('.mjs'))) {
    return { prose: false, headings: false, emoji: true };
  }
  return null;
}

/** Inline code, link targets and emphasis markers are not prose. */
function stripInlineMarkup(text) {
  return text
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]+/g, '');
}

/** Drops leading and trailing non-letters, the way a `^[^A-Za-z]+` / `[^A-Za-z]+$` pair would. */
function trimToLetters(word) {
  let start = 0;
  let end = word.length;
  while (start < end && !LETTER.test(word[start])) {
    start += 1;
  }
  while (end > start && !LETTER.test(word[end - 1])) {
    end -= 1;
  }
  return word.slice(start, end);
}

/**
 * A heading is title case when a word after the first is capitalised for no reason.
 * A proper noun, an acronym, and the word opening a subtitle after a colon all have a reason.
 */
function titleCaseWords(headingText) {
  let text = stripInlineMarkup(headingText).replace(/^\d+\.\s*/, '');
  for (const phrase of PROPER_PHRASES) {
    text = text.split(phrase).join(phrase.replace(/\S+/g, 'X'));
  }
  const words = text.split(/\s+/).filter(Boolean);
  const offenders = [];
  for (const [index, word] of words.entries()) {
    const opensTheHeading = index === 0 || /[:.?!]$/.test(words[index - 1]);
    const parts = word.split('-');
    for (const [position, part] of parts.entries()) {
      if (opensTheHeading && position === 0) {
        continue;
      }
      const bare = trimToLetters(part);
      if (/^[A-Z][a-z]+$/.test(bare) && !PROPER_NOUNS.has(bare)) {
        offenders.push(bare);
      }
    }
  }
  return offenders;
}

const failures = [];

function record(rel, lineNumber, tell, detail) {
  failures.push({ rel, lineNumber, tell, detail });
}

for await (const { full, rel } of walk(root)) {
  const checks = checksFor(rel);
  if (!checks) {
    continue;
  }

  const lines = (await readFile(full, 'utf8')).split('\n');
  let insideFence = false;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (checks.headings && /^\s*(?:```|~~~)/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) {
      continue;
    }

    if (checks.emoji && EMOJI.test(line)) {
      record(rel, lineNumber, 'emoji', line.trim());
    }
    if (!checks.prose) {
      continue;
    }
    if (line.includes(EM_DASH)) {
      record(rel, lineNumber, 'em dash', line.trim());
    }
    if (CURLY_QUOTES.test(line)) {
      record(rel, lineNumber, 'curly quote', line.trim());
    }
    const filler = FILLER.exec(stripInlineMarkup(line));
    if (filler) {
      record(rel, lineNumber, `filler word "${filler[0]}"`, line.trim());
    }
    if (HEDGE.test(stripInlineMarkup(line))) {
      record(rel, lineNumber, 'hedging opener', line.trim());
    }

    const heading = checks.headings && /^#{1,6}\s(.*)$/.exec(line);
    if (heading) {
      const offenders = titleCaseWords(heading[1].trim());
      if (offenders.length > 0) {
        record(rel, lineNumber, `title case (${offenders.join(', ')})`, line.trim());
      }
    }
  }
}

if (failures.length > 0) {
  const byFile = new Map();
  for (const failure of failures) {
    const list = byFile.get(failure.rel) ?? [];
    list.push(failure);
    byFile.set(failure.rel, list);
  }

  console.error(`Developer-facing prose carries ${failures.length} AI tell${failures.length === 1 ? '' : 's'}.\n`);
  for (const [file, list] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    console.error(`  ${file}`);
    for (const failure of list) {
      console.error(`    ${failure.lineNumber}: ${failure.tell}`);
      console.error(`      ${failure.detail.slice(0, 110)}`);
    }
  }
  console.error(
    '\nSentence case for headings, no em dashes, straight quotes, no filler.',
    '\nA flagged proper noun belongs in PROPER_NOUNS in scripts/assert-no-ai-tells.mjs.'
  );
  process.exit(1);
}
