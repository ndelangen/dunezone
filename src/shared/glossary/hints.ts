import { GLOSSARY } from './terms';
import type { GlossaryTerm } from './terms';

/** One avoided word found in a piece of text, with the term the glossary prefers instead. */
export type TermHint = {
  /** The word as it was written, with any run of whitespace inside a phrase shown as one space. */
  found: string;
  /** Where the word starts in the text. */
  index: number;
  term: GlossaryTerm;
};

type Span = readonly [number, number];

type Matcher = { pattern: RegExp; term: GlossaryTerm; exceptions: readonly RegExp[] };

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
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
          return [avoided.word, ...(avoided.forms ?? [])].map((word) => ({ word, term, exceptions }));
        })
    )
    .sort((a, b) => b.word.length - a.word.length)
    .map(({ word, term, exceptions }) => ({
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'giu'),
      term,
      exceptions,
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
  for (const { pattern, term, exceptions } of glossary ? matchers(glossary) : DEFAULT_MATCHERS) {
    for (const match of text.matchAll(pattern)) {
      const span: Span = [match.index, match.index + match[0].length];
      const claimed = covers(taken, span, false);
      if (claimed || covers(excusedMask(text, exceptions, cache), span, true)) {
        continue;
      }
      taken.fill(1, span[0], span[1]);
      hints.push({ found: match[0].replace(/\s+/g, ' '), index: match.index, term });
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
