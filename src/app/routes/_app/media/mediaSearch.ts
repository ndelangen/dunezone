import { catalogueEntries as mediaEntries, mediaKinds } from './mediaCatalogue';
import type { MediaEntry, MediaSearch } from './mediaCatalogue';
import { mediaSubjects, subjectLabel } from './mediaSubjects';

const synonyms: Record<string, string> = {};
for (const family of [
  'knife knives knifes',
  'cross crossed crossing',
  'carry carrying carries holding hold holds held',
  'person people figure figures human humans man woman',
  'hood hooded',
  'armor armored armour armoured',
  'gray grey',
  'gold golden',
  'robot robotic robots android automaton',
  'aircraft airplane aeroplane plane',
  'gun guns firearm firearms',
  'syringe suringe',
  'bureaucrat beaurocrat',
  'sietch seitch',
  'storm storrm',
  'respirator respirators breathing',
  'mushroom mushrooms fungi fungus fungal',
  'spaceship spacecraft',
  'circle circular',
  'triangle triangular',
  'ring rings ringed',
]) {
  const words = family.split(' ');
  for (const word of words) {
    synonyms[word] = words[0]!;
  }
}

function normalize(text: string) {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(text: string) {
  return normalize(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (synonyms[word]) {
        return synonyms[word];
      }
      return word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
    });
}

function words(text: string) {
  return new Set(tokens(text));
}

/* Only visible descriptions and per-file tags belong here; collection-wide keywords create false matches. */
const documents = mediaEntries.map((entry) => ({
  entry,
  name: normalize(entry.label),
  title: words(entry.label),
  detail: words(`${entry.description} ${entry.tags.join(' ')}`),
  path: words(entry.value),
  context: words(`${mediaKinds.find((kind) => kind.value === entry.kind)?.label}`),
}));

/* Adjacent transpositions count as one typo, as do a missing, extra or substituted letter. */
function closeSpelling(a: string, b: string) {
  const limit = a.length >= 8 ? 2 : 1;
  if (Math.abs(a.length - b.length) > limit) {
    return false;
  }
  const rows = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) {
    rows[i]![0] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    rows[0]![j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i]![j] = Math.min(rows[i]![j]!, rows[i - 2]![j - 2]! + 1);
      }
    }
  }
  return rows[a.length]![b.length]! <= limit;
}

function matchWeight(term: string, field: ReadonlySet<string>, fuzzy: boolean) {
  if (field.has(term)) {
    return 3;
  }
  if (term.length >= 3 && !synonyms[term] && [...field].some((word) => word.startsWith(term))) {
    return 2;
  }
  return fuzzy && term.length >= 4 && [...field].some((word) => closeSpelling(term, word)) ? 1 : 0;
}

export function searchMedia(query: string, fuzzy = true) {
  const terms = [...new Set(tokens(query))].filter(
    (term) => !['a', 'an', 'the', 'of', 'with', 'and', 'in'].includes(term)
  );
  if (!terms.length) {
    return mediaEntries;
  }
  const phrase = normalize(query);
  return documents
    .flatMap((document) => {
      const context = document.context;
      let score = document.name === phrase ? 1000 : document.name.includes(phrase) ? 100 : 0;
      let approximateTerms = 0;
      for (const term of terms) {
        if (
          !matchWeight(term, document.title, false) &&
          !matchWeight(term, document.detail, false) &&
          !matchWeight(term, document.path, false) &&
          !matchWeight(term, context, false)
        ) {
          approximateTerms++;
        }
        const match = Math.max(
          matchWeight(term, document.title, fuzzy) * 12,
          matchWeight(term, document.detail, fuzzy) * 5,
          matchWeight(term, document.path, false) * 3,
          matchWeight(term, context, false)
        );
        if (!match) {
          return [];
        }
        score += match;
      }
      return [{ entry: document.entry, score: score - approximateTerms * 1000 }];
    })
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label, 'en'))
    .map(({ entry }) => entry);
}

export const mediaPageSize = 60;

export function filterCatalogue(search: MediaSearch) {
  const collectionOf = (entry: MediaEntry) => entry.collection;
  const kindMatches = (entry: MediaEntry) => search.kind === 'all' || search.kind === entry.kind;
  const subjectMatches = (entry: MediaEntry) => !search.subject || entry.subjects.includes(search.subject);
  const collectionMatches = (entry: MediaEntry) => !search.group || collectionOf(entry) === search.group;
  const candidates = searchMedia(search.q);
  const exact = searchMedia(search.q, false);
  const approximate =
    Boolean(search.q.trim()) &&
    !exact.some((entry) => kindMatches(entry) && subjectMatches(entry) && collectionMatches(entry)) &&
    candidates.some((entry) => kindMatches(entry) && subjectMatches(entry) && collectionMatches(entry));
  const matches = candidates.filter((entry) => kindMatches(entry) && subjectMatches(entry) && collectionMatches(entry));
  const collections = [...new Set(mediaEntries.filter(kindMatches).map(collectionOf))].sort((a, b) =>
    a.localeCompare(b, 'en')
  );
  const kindCounts = mediaKinds.map((kind) => ({
    ...kind,
    count: candidates.filter((entry) => entry.kind === kind.value && subjectMatches(entry) && collectionMatches(entry))
      .length,
  }));
  const subjectCounts = mediaSubjects.map((subject) => ({
    ...subject,
    count: candidates.filter(
      (entry) => entry.subjects.includes(subject.value) && kindMatches(entry) && collectionMatches(entry)
    ).length,
  }));
  const collectionCounts = collections.map((collection) => ({
    value: collection,
    label: collection,
    count: candidates.filter(
      (entry) => collectionOf(entry) === collection && kindMatches(entry) && subjectMatches(entry)
    ).length,
  }));
  const groupedCollection = (entry: MediaEntry) =>
    entry.kind === 'leader' || entry.kind === 'decal' || search.browse === 'collection';
  const groupOf = (entry: MediaEntry) =>
    groupedCollection(entry)
      ? entry.collection
      : search.q.trim()
        ? 'Other results'
        : subjectLabel(search.subject ?? entry.subjects[0]!);
  const ordered = search.q.trim()
    ? matches
    : [...matches].sort((a, b) => groupOf(a).localeCompare(groupOf(b), 'en') || a.label.localeCompare(b.label, 'en'));
  const pageCount = Math.max(1, Math.ceil(ordered.length / mediaPageSize));
  const page = Math.min(search.page ?? 1, pageCount);
  const visible = ordered.slice((page - 1) * mediaPageSize, page * mediaPageSize);
  const groups = [...new Set(visible.map(groupOf))].map((label) => {
    const entries = visible.filter((entry) => groupOf(entry) === label);
    const first = entries[0]!;
    const collection = groupedCollection(first) ? first.collection : undefined;
    const total = collection ? mediaEntries.filter((entry) => entry.collection === collection).length : entries.length;
    return { label, entries, collection, total, kind: first.kind };
  });
  return {
    matches,
    collections,
    groups,
    kindCounts,
    subjectCounts,
    collectionCounts,
    page,
    pageCount,
    approximate,
  };
}
