import { GLOSSARY } from './terms';
import type { GlossaryTerm } from './terms';

/** One avoided word found in a piece of text, with the term the glossary prefers instead. */
export type TermHint = {
  /** The word as it was written, with any run of whitespace inside a phrase shown as one space. */
  found: string;
  /** Where the word starts in the text. */
  index: number;
  /** How many characters the word takes up in the text, which can differ from `found` when a phrase spans a line break. */
  length: number;
  term: GlossaryTerm;
  /** The glossary's wording to put in place of `found`, in the same case; absent when only a person can reword it. */
  fix?: string;
};

type Span = readonly [number, number];

type Matcher = { pattern: RegExp; term: GlossaryTerm; exceptions: readonly RegExp[]; fix?: string };

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '(?=\\s)[^\\S\\n]*\\n?[^\\S\\n]*');
}

function global(exception: RegExp) {
  return exception.flags.includes('g') ? exception : new RegExp(exception.source, `${exception.flags}g`);
}

/* Longer phrases come first so "elite forces" wins over "forces" at the same position. */
function matchers(glossary: readonly GlossaryTerm[]): Matcher[] {
  return glossary
    .flatMap((term) =>
      term.avoid
        .filter((avoided) => avoided.hint !== false)
        .flatMap((avoided) => {
          const exceptions = (avoided.exceptions ?? []).map(global);
          return [avoided.word, ...(avoided.forms ?? [])].map((word) => ({
            word,
            term,
            exceptions,
            fix: avoided.fixes?.[word.toLowerCase()],
          }));
        })
    )
    .sort((a, b) => b.word.length - a.word.length)
    .map(({ word, term, exceptions, fix }) => ({
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'giu'),
      term,
      exceptions,
      fix,
    }));
}

const DEFAULT_MATCHERS = matchers(GLOSSARY);

/*
 * Coverage is kept per character, so checking a match costs its own length rather than the number of matches so far.
 * Each set of exceptions runs once per text, and exceptions keep their own flags: one that should ignore case says so with its own `i`.
 */
function excusedMask(text: string, exceptions: readonly RegExp[], cache: Map<readonly RegExp[], Uint8Array>) {
  const cached = cache.get(exceptions);
  if (cached) {
    return cached;
  }
  const mask = new Uint8Array(text.length);
  for (const exception of exceptions) {
    for (const match of text.matchAll(exception)) {
      mask.fill(1, match.index, match.index + match[0].length);
    }
  }
  cache.set(exceptions, mask);
  return mask;
}

/* Two capitals and no small letters: an author who wrote FORCES gets TROOPS back. */
const SHOUTED = /^[^\p{Ll}]*\p{Lu}[^\p{Ll}]*\p{Lu}[^\p{Ll}]*$/u;

/*
 * The fix follows the author's case: shouted words stay shouted, and a capital at the start of a sentence stays.
 * A fix that is a name, such as Spice Bank, keeps its own capitals.
 */
function inCaseOf({ found, fix }: { found: string; fix: string }) {
  if (fix !== fix.toLowerCase()) {
    return fix;
  }
  if (SHOUTED.test(found)) {
    return fix.toUpperCase();
  }
  return /^\p{Lu}/u.test(found) ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix;
}

function covers(mask: Uint8Array, [start, end]: Span, every: boolean) {
  const part = mask.subarray(start, end);
  return every ? part.every(Boolean) : part.some(Boolean);
}

/**
 * Finds words in free text that the glossary prefers to say differently, in reading order.
 * Hints are advice only: callers show them beside the text and never block a save on them.
 * Each stretch of text yields at most one hint, so a phrase and a word inside it are not both reported.
 */
export function findTermHints(text: string, glossary?: readonly GlossaryTerm[]): TermHint[] {
  const taken = new Uint8Array(text.length);
  const hints: TermHint[] = [];
  const cache = new Map<readonly RegExp[], Uint8Array>();
  for (const { pattern, term, exceptions, fix } of glossary ? matchers(glossary) : DEFAULT_MATCHERS) {
    for (const match of text.matchAll(pattern)) {
      const span: Span = [match.index, match.index + match[0].length];
      const claimed = covers(taken, span, false);
      if (claimed || covers(excusedMask(text, exceptions, cache), span, true)) {
        continue;
      }
      taken.fill(1, span[0], span[1]);
      const found = match[0].replace(/\s+/g, ' ');
      hints.push({
        found,
        index: match.index,
        length: match[0].length,
        term,
        ...(fix ? { fix: inCaseOf({ found, fix }) } : {}),
      });
    }
  }
  return hints.sort((a, b) => a.index - b.index);
}

/** The distinct hints to show for a text: one per avoided spelling, so a word repeated ten times reads as one hint. */
export function distinctTermHints(text: string, glossary?: readonly GlossaryTerm[]): TermHint[] {
  const seen = new Set<string>();
  return findTermHints(text, glossary).filter((hint) => {
    const key = `${hint.term.id}:${hint.found.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Rewrites every avoided word the glossary knows a safe replacement for, and leaves the rest for the author.
 * It only runs when the author asks for it, never on its own.
 */
export function fixTermWording(text: string, glossary?: readonly GlossaryTerm[]): string {
  let fixed = '';
  let from = 0;
  for (const hint of findTermHints(text, glossary)) {
    if (hint.fix === undefined) {
      continue;
    }
    fixed += text.slice(from, hint.index) + hint.fix;
    from = hint.index + hint.length;
  }
  return fixed + text.slice(from);
}
