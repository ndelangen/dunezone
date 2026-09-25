#!/usr/bin/env node
/**
 * Fails when a stylesheet under `src` asks the window its width anywhere but the window chrome, or asks it off the ladder.
 *
 * The rule is "Breakpoints are one ladder, and only the window asks the window" in docs/technical/ui-design-decisions.md.
 * Everything inside a page lays out by the room it is given, with `@container`.
 * Only the files below size against the viewport, and they use the same three steps.
 * A width feature counts in every spelling a media condition allows: `width`, `min-width`, `max-width`, the `device-` forms, and range syntax such as `(30rem <= width < 62rem)`.
 * Other media conditions, such as `prefers-reduced-motion` or `print`, pass anywhere.
 * `@container` conditions are not read: a container threshold may be derived from its own content, which only a reviewer can judge.
 * Media conditions written in TypeScript (`matchMedia`, Mantine's `visibleFrom`) are outside this scan.
 *
 * A source scan under ADR-0001's narrow exception: the guarantee is a spelling across the whole tree, and oxlint has no rule that reads stylesheets.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const LADDER = ['30rem', '48rem', '62rem'];

/** Paths are relative to the scanned root. Each entry names why that file sizes against the window. */
const WINDOW_CHROME = new Map([
  ['app/shell/AppHeader.module.css', 'the artwork band, whose height the page frame matches'],
  ['app/shell/AppRoot.module.css', 'the shell frame and its inline gutter'],
  ['app/shell/SiteNavigation.module.css', 'the site navigation bar'],
  ['app/styles/page.css', 'the document background'],
  ['app/styles/tokens.css', 'the responsive spacing scale'],
  ['app/ui/layout/PageLayout.module.css', 'the page frame, sized with the artwork band'],
  ['app/routes/_app/play/dune-play.css', 'the play route, which fills the window'],
]);

/*
 * Page-level width queries that predate the ladder, each still to move to `@container` or onto a step.
 * Part (b) of the breakpoint decision on #1321 empties this list, and a listed file that no longer asks the window's width fails, so an entry cannot outlive its query.
 */
const PENDING_CONTAINER_MIGRATION = [
  'app/print/sheet/sheet-page.css',
  'app/routes/_app/assets/$type/index.module.css',
  'app/routes/_app/factions/$factionId/index.module.css',
  'app/routes/_app/factions/index.module.css',
  'app/routes/_app/future-plans/index.module.css',
  'app/routes/_app/groups/$groupSlug/index.module.css',
  'app/routes/_app/index.module.css',
  'app/routes/_app/profiles/$profileSlug/index.module.css',
  'app/ui/block/FactionCard.module.css',
  'app/ui/block/PageIdentity.module.css',
  'app/ui/block/PageTitle.module.css',
  'app/ui/list/FactionList.module.css',
  'app/ui/surface/NestedTabs.stories.module.css',
  'app/ui/surface/Spotlight.module.css',
  'app/widgets/authoring/AuthoringToolbar.module.css',
  'app/widgets/faction-editor/FactionCollectionShelf.module.css',
  'app/widgets/faction-editor/FactionEditor.module.css',
  'app/widgets/faction-editor/FactionSheetReview.module.css',
];

const root = process.env.BREAKPOINTS_ROOT ?? 'src';

const stylesheets = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
  .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));

/*
 * A commented-out query applies nothing, and prose about one is not one.
 * Newlines survive the blanking, so line numbers hold.
 */
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));

const WIDTH_FEATURE = /^(?:min-|max-)?(?:device-)?width$/i;

/** The contents of every parenthesised group in a prelude, nested ones included. */
function groups(prelude) {
  const found = [];
  const opens = [];
  for (let index = 0; index < prelude.length; index += 1) {
    if (prelude[index] === '(') {
      opens.push(index);
    } else if (prelude[index] === ')' && opens.length > 0) {
      found.push(prelude.slice(opens.pop() + 1, index));
    }
  }
  return found;
}

/** The values a media prelude compares the window's width against, `calc()` and all. */
function widthValues(prelude) {
  const values = [];
  for (const condition of groups(prelude)) {
    const colon = condition.indexOf(':');
    if (colon !== -1) {
      if (WIDTH_FEATURE.test(condition.slice(0, colon).trim())) {
        values.push(condition.slice(colon + 1).trim());
      }
      continue;
    }
    const operands = condition.split(/<=|>=|<|>|=/).map((operand) => operand.trim());
    if (operands.length > 1 && operands.some((operand) => WIDTH_FEATURE.test(operand))) {
      values.push(...operands.filter((operand) => !WIDTH_FEATURE.test(operand)));
    }
  }
  return values;
}

/** Every width query in a stylesheet, with the line its `@media` starts on. */
function widthQueries(text) {
  const queries = [];
  for (const match of withoutComments(text).matchAll(/@media\b([^{;]*)/g)) {
    const values = widthValues(match[1]);
    if (values.length > 0) {
      const line = text.slice(0, match.index).split('\n').length;
      queries.push({ line, prelude: match[1].trim(), values });
    }
  }
  return queries;
}

const failures = [];
const queriesByFile = new Map(stylesheets.map((path) => [path, widthQueries(readFileSync(join(root, path), 'utf8'))]));

for (const [path, queries] of queriesByFile) {
  if (PENDING_CONTAINER_MIGRATION.includes(path)) {
    continue;
  }
  for (const { line, prelude, values } of queries) {
    if (!WINDOW_CHROME.has(path)) {
      failures.push(`${path}:${line} @media ${prelude}: a width query outside the window chrome`);
      continue;
    }
    const offLadder = values.filter((value) => !LADDER.includes(value));
    if (offLadder.length > 0) {
      failures.push(`${path}:${line} @media ${prelude}: ${offLadder.join(', ')} is not on the ladder`);
    }
  }
}

for (const path of WINDOW_CHROME.keys()) {
  if (!queriesByFile.has(path)) {
    failures.push(`${path}: listed as window chrome, but no such stylesheet exists`);
  }
}

for (const path of PENDING_CONTAINER_MIGRATION) {
  if (!queriesByFile.get(path)?.length) {
    failures.push(`${path}: listed as pending migration, but it has no width query left; remove the entry`);
  }
}

if (failures.length > 0) {
  console.error('Breakpoint check failed:');
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  console.error(
    `\nThe ladder is ${LADDER.join(', ')}, spelled in rem.` +
      ' Inside a page, lay out by the room given with @container.' +
      ' Only the window chrome listed in scripts/assert-breakpoints.mjs asks the window its width:\n' +
      [...WINDOW_CHROME].map(([path, why]) => `  - ${path}: ${why}`).join('\n')
  );
  process.exit(1);
}

console.log(
  `Breakpoint check passed: ${stylesheets.length} stylesheets under ${root}, width queries only in the window chrome and on ${LADDER.join(', ')}.`
);
