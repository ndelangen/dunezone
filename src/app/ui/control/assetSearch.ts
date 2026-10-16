interface SearchableAsset {
  label: string;
  keywords?: string;
}

/** Higher is better: 0 hides the asset, 1 is a near miss, 2 contains every typed word. */
export type AssetMatch = 0 | 1 | 2;

function normalize(text: string) {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function searchTerms(query: string) {
  return normalize(query).split(' ').filter(Boolean);
}

/** Optimal string alignment distance: insertions, deletions, substitutions and adjacent swaps. */
function editDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) {
    rows[0]![j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

/** A typed word is close to a name word when it is a near miss of the whole word or of its start. */
function closeTo(term: string, word: string) {
  if (term.length < 4) {
    return false;
  }
  const allowed = term.length >= 8 ? 2 : 1;
  if (Math.abs(word.length - term.length) <= allowed && editDistance(term, word) <= allowed) {
    return true;
  }
  return word.length > term.length && editDistance(term, word.slice(0, term.length)) <= allowed;
}

/**
 * Every term must appear in the asset's text, or be a near miss of a word in its name ("nafud" finds Nefud, "dryeuh" finds Yueh).
 * Near misses only look at the name so collection keywords cannot pull in unrelated artwork.
 */
export function matchAsset(terms: readonly string[], asset: SearchableAsset, extra = ''): AssetMatch {
  const nameWords = searchTerms(asset.label);
  const names = [...nameWords, nameWords.join('')];
  const text = `${normalize(`${asset.label} ${asset.keywords ?? ''} ${extra}`)} ${names.at(-1)}`;
  let result: AssetMatch = 2;
  for (const term of terms) {
    if (text.includes(term)) {
      continue;
    }
    if (!names.some((word) => closeTo(term, word))) {
      return 0;
    }
    result = 1;
  }
  return result;
}
