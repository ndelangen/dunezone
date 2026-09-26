#!/usr/bin/env node
/**
 * Fails when a stylesheet under `src` asks the window its width anywhere but the window chrome, off the ladder, or in a form other than `width < step` or `width >= step`.
 *
 * The rule is "Breakpoints are one ladder, and only the window asks the window" in docs/technical/ui-design-decisions.md.
 * Everything inside a page lays out by the room it is given, with `@container`.
 * Only the window chrome below sizes against the viewport, and it uses the same three steps.
 * A step belongs to its wider side, so the chrome writes it in range syntax as `width < step` or `width >= step`.
 * `max-width: step` puts a window exactly at the step on the narrower side, and `min-width: step`, though it lands on the same side, is a second spelling of `width >= step`, so both fail.
 * The pending list below holds the page-level queries that predate the rule, each exactly as its file asks it today.
 * A width feature counts in every spelling a media condition allows: `width`, `min-width`, `max-width`, the `device-` forms, range syntax such as `(30rem <= width < 62rem)`, and the boolean `(width)`.
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
 * Each file is held to the preludes it asks today, so a new or changed width query in it fails like one anywhere else.
 * Part (b) of the breakpoint decision on #1321 empties this list, and a listed prelude its file no longer asks fails, so an entry cannot outlive its query.
 */
const PENDING_CONTAINER_MIGRATION = new Map([
  ['app/print/sheet/sheet-page.css', ['(max-width: 900px)']],
  ['app/routes/_app/assets/$type/index.module.css', ['(max-width: 30em)']],
  [
    'app/routes/_app/factions/$factionId/index.module.css',
    ['(max-width: 62em)', '(max-width: 48em)', '(max-width: 30em)'],
  ],
  ['app/routes/_app/factions/index.module.css', ['(max-width: 48em)']],
  ['app/routes/_app/future-plans/index.module.css', ['(max-width: 40.625em)']],
  ['app/routes/_app/groups/$groupSlug/index.module.css', ['(max-width: 62em)']],
  ['app/routes/_app/index.module.css', ['(max-width: 43.75em)', '(max-width: 61.25em)']],
  ['app/routes/_app/profiles/$profileSlug/index.module.css', ['(max-width: 800px)']],
  ['app/ui/block/FactionCard.module.css', ['(max-width: 48em)']],
  ['app/ui/block/PageIdentity.module.css', ['(max-width: 48em)', '(max-width: 30em)']],
  ['app/ui/block/PageTitle.module.css', ['(max-width: 43.75em)']],
  ['app/ui/list/FactionList.module.css', ['(max-width: 62em)', '(max-width: 48em)']],
  ['app/ui/surface/NestedTabs.stories.module.css', ['(max-width: 34rem)']],
  ['app/ui/surface/Spotlight.module.css', ['(max-width: 30em)']],
  ['app/widgets/authoring/AuthoringToolbar.module.css', ['(max-width: 70em)', '(max-width: 47.99em)']],
  ['app/widgets/faction-editor/FactionCollectionShelf.module.css', ['(max-width: 48em)', '(max-width: 30em)']],
  [
    'app/widgets/faction-editor/FactionEditor.module.css',
    ['(max-width: 74em)', '(max-width: 62em)', '(max-width: 48em)'],
  ],
  ['app/widgets/faction-editor/FactionSheetReview.module.css', ['(max-width: 47.99em)']],
]);

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

/** The operator a comparison reads with when its two sides swap, so `48rem > width` reads as `width < 48rem`. */
const MIRRORED = new Map([
  ['<', '>'],
  ['>', '<'],
  ['<=', '>='],
  ['>=', '<='],
  ['=', '='],
]);

/**
 * Every comparison a media prelude makes against the window's width, `calc()` and all.
 * Each carries the value it compares against, the comparison as written with the feature first, and whether a window exactly at that value lands on the wider side.
 */
function widthComparisons(prelude) {
  const comparisons = [];
  for (const condition of groups(prelude)) {
    const colon = condition.indexOf(':');
    if (colon !== -1) {
      const feature = condition.slice(0, colon).trim();
      if (WIDTH_FEATURE.test(feature)) {
        const value = condition.slice(colon + 1).trim();
        comparisons.push({ value, form: `${feature}: ${value}`, widerSide: false });
      }
      continue;
    }
    const parts = condition.split(/(<=|>=|<|>|=)/).map((part) => part.trim());
    if (parts.length === 1) {
      if (WIDTH_FEATURE.test(parts[0])) {
        /* A boolean `(width)` compares against nothing, so the feature itself stands in for the value, which no step matches. */
        comparisons.push({ value: parts[0], form: parts[0], widerSide: false });
      }
      continue;
    }
    /* Range syntax alternates operand and operator, so `30rem <= width < 62rem` is two comparisons that share `width`. */
    for (let index = 1; index < parts.length; index += 2) {
      const [left, operator, right] = [parts[index - 1], parts[index], parts[index + 1]];
      if (WIDTH_FEATURE.test(left) === WIDTH_FEATURE.test(right)) {
        continue;
      }
      const [feature, reading, value] = WIDTH_FEATURE.test(left)
        ? [left, operator, right]
        : [right, MIRRORED.get(operator), left];
      const widerSide = feature.toLowerCase() === 'width' && (reading === '<' || reading === '>=');
      comparisons.push({ value, form: `${feature} ${reading} ${value}`, widerSide });
    }
  }
  return comparisons;
}

/** Every width query in a stylesheet, with the line its `@media` starts on. */
function widthQueries(text) {
  const queries = [];
  for (const match of withoutComments(text).matchAll(/@media\b([^{;]*)/g)) {
    const comparisons = widthComparisons(match[1]);
    if (comparisons.length > 0) {
      const line = text.slice(0, match.index).split('\n').length;
      queries.push({ line, prelude: match[1].trim(), comparisons });
    }
  }
  return queries;
}

const failures = [];
const queriesByFile = new Map(stylesheets.map((path) => [path, widthQueries(readFileSync(join(root, path), 'utf8'))]));
/** The pending preludes each file no longer asks, filled in as its queries are matched. */
const unasked = new Map(PENDING_CONTAINER_MIGRATION);

for (const [path, queries] of queriesByFile) {
  const pending = [...(PENDING_CONTAINER_MIGRATION.get(path) ?? [])];
  for (const { line, prelude, comparisons } of queries) {
    const held = pending.indexOf(prelude);
    if (held !== -1) {
      pending.splice(held, 1);
      continue;
    }
    if (!WINDOW_CHROME.has(path)) {
      failures.push(`${path}:${line} @media ${prelude}: a width query outside the window chrome`);
      continue;
    }
    const offLadder = comparisons.filter(({ value }) => !LADDER.includes(value));
    if (offLadder.length > 0) {
      failures.push(
        `${path}:${line} @media ${prelude}: ${offLadder.map(({ value }) => value).join(', ')} is not on the ladder`
      );
    }
    for (const { value, form } of comparisons.filter(
      (comparison) => LADDER.includes(comparison.value) && !comparison.widerSide
    )) {
      failures.push(
        `${path}:${line} @media ${prelude}: ${form} is not written as width < ${value} or width >= ${value}`
      );
    }
  }
  if (unasked.has(path)) {
    unasked.set(path, pending);
  }
}

for (const path of WINDOW_CHROME.keys()) {
  if (!queriesByFile.has(path)) {
    failures.push(`${path}: listed as window chrome, but no such stylesheet exists`);
  }
}

for (const [path, preludes] of unasked) {
  for (const prelude of preludes) {
    failures.push(
      `${path}: listed as pending migration at @media ${prelude}, but the file no longer asks it; remove the prelude, and the entry once it is empty`
    );
  }
}

if (failures.length > 0) {
  console.error('Breakpoint check failed:');
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  console.error(
    `\nThe ladder is ${LADDER.join(', ')}, spelled in rem and written as width < step or width >= step, so a window exactly at a step takes the wider side.` +
      ' Inside a page, lay out by the room given with @container.' +
      ' Only the window chrome listed in scripts/assert-breakpoints.mjs asks the window its width:\n' +
      [...WINDOW_CHROME].map(([path, why]) => `  - ${path}: ${why}`).join('\n')
  );
  process.exit(1);
}

console.log(
  `Breakpoint check passed: ${stylesheets.length} stylesheets under ${root}, width queries only in the window chrome and on ${LADDER.join(', ')} with each step on its wider side, apart from the ${PENDING_CONTAINER_MIGRATION.size} stylesheets pending migration.`
);
