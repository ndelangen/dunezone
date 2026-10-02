import { GLOSSARY } from './terms';
import type { GlossaryTerm } from './terms';

/** One avoided word found in a piece of text, with the term the glossary prefers instead. */
export type TermHint = {
  /** The word exactly as it was written. */
  found: string;
  /** Where the word starts in the text. */
  index: number;
  term: GlossaryTerm;
};

type Matcher = { pattern: RegExp; term: GlossaryTerm; exceptions: readonly RegExp[] };

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

/* Longer phrases come first so "elite troops" wins over "troops" at the same position. */
function matchers(glossary: readonly GlossaryTerm[]): Matcher[] {
  return glossary
    .flatMap((term) =>
      term.avoid
        .filter((avoided) => avoided.hint !== false)
        .flatMap((avoided) =>
          [avoided.word, ...(avoided.forms ?? [])].map((word) => ({
            word,
            term,
            exceptions: avoided.exceptions ?? [],
          }))
        )
    )
    .sort((a, b) => b.word.length - a.word.length)
    .map(({ word, term, exceptions }) => ({
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'giu'),
      term,
      exceptions,
    }));
}

const DEFAULT_MATCHERS = matchers(GLOSSARY);

function excused(text: string, start: number, end: number, exceptions: readonly RegExp[]) {
  return exceptions.some((exception) => {
    const flags = exception.flags.includes('g') ? exception.flags : `${exception.flags}g`;
    for (const match of text.matchAll(new RegExp(exception.source, flags))) {
      if (match.index <= start && match.index + match[0].length >= end) {
        return true;
      }
    }
    return false;
  });
}

/* A match is skipped when a longer phrase already claimed its text, or when an exception excuses it. */
function skipped(
  text: string,
  taken: readonly [number, number][],
  [start, end]: [number, number],
  exceptions: readonly RegExp[]
) {
  const overlaps = taken.some(([from, to]) => start < to && end > from);
  return overlaps || excused(text, start, end, exceptions);
}

/**
 * Finds words in free text that the glossary prefers to say differently, in reading order.
 * Hints are advice only: callers show them beside the text and never block a save on them.
 * Each stretch of text yields at most one hint, so a phrase and a word inside it are not both reported.
 */
export function findTermHints(text: string, glossary?: readonly GlossaryTerm[]): TermHint[] {
  const taken: [number, number][] = [];
  const hints: TermHint[] = [];
  for (const { pattern, term, exceptions } of glossary ? matchers(glossary) : DEFAULT_MATCHERS) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (skipped(text, taken, [start, end], exceptions)) {
        continue;
      }
      taken.push([start, end]);
      hints.push({ found: match[0], index: start, term });
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
