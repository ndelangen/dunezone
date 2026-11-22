import type { TablePiece } from '@shared/play/model';

/*
 * Names of pieces that are already plural, or the same in the plural: the Dune troops named after a people.
 * Catalogue spellings vary, so each is matched case aside.
 */
const SAME_IN_PLURAL = new Set(['fedaykin', 'sardaukar', 'saudarkar', 'fremen', 'tleilaxu', 'spice', 'troops']);

/* The plural of one English word, keeping its case; a word it cannot read, such as one ending in a digit or a bracket, stays. */
function pluralWord(word: string): string {
  const lower = word.toLowerCase();
  if (SAME_IN_PLURAL.has(lower) || !/[a-z]$/i.test(word) || /s$/i.test(word)) {
    return word;
  }
  const upper = word === word.toUpperCase() && /[a-z]/i.test(word);
  const suffix = (ending: string) => (upper ? ending.toUpperCase() : ending);
  if (/[^aeiou]y$/i.test(word)) {
    return `${word.slice(0, -1)}${suffix('ies')}`;
  }
  if (/(x|z|ch|sh)$/i.test(word)) {
    return `${word}${suffix('es')}`;
  }
  return `${word}${suffix('s')}`;
}

/**
 * A stack's name with its count, as its tooltip reads it (#2988): "10 Harkonnen Troops", "3 Fedaykin".
 * Catalogue pieces are named in the singular, so the last word takes the plural.
 * A deck counts its cards after its name, "Spice deck, 25 cards", since the count is not of decks.
 */
export function countedLabel(piece: Pick<TablePiece, 'kind' | 'label'>, count: number): string {
  const label = piece.label.trim();
  if (piece.kind === 'card') {
    return label ? `${label}, ${count} cards` : `${count} cards`;
  }
  const at = label.search(/\S+$/);
  if (at < 0) {
    return String(count);
  }
  return `${count} ${label.slice(0, at)}${pluralWord(label.slice(at))}`;
}
