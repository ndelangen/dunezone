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
  return normalize(text).split(/\s+/).filter(Boolean).map(canonicalWord);
}

function canonicalWord(word: string) {
  if (synonyms[word]) {
    return synonyms[word];
  }
  const plural = word.length > 4 && word.endsWith('s') && !word.endsWith('ss');
  return plural ? word.slice(0, -1) : word;
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
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (isTransposition({ a, b, i, j })) {
        rows[i]![j] = Math.min(rows[i]![j]!, rows[i - 2]![j - 2]! + 1);
      }
    }
  }
  return rows[a.length]![b.length]! <= limit;
}

function isTransposition({ a, b, i, j }: { a: string; b: string; i: number; j: number }) {
  if (i < 2 || j < 2) {
    return false;
  }
  return a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
}

function matchWeight(term: string, field: ReadonlySet<string>, fuzzy: boolean) {
  if (field.has(term)) {
    return 3;
  }
  const prefixAllowed = term.length >= 3 && !synonyms[term];
  if (prefixAllowed && [...field].some((word) => word.startsWith(term))) {
    return 2;
  }
  if (!fuzzy || term.length < 4) {
    return 0;
  }
  return [...field].some((word) => closeSpelling(term, word)) ? 1 : 0;
}

export function searchMedia(query: string, fuzzy = true) {
  const terms = [...new Set(tokens(query))].filter(
    (term) => !['a', 'an', 'the', 'of', 'with', 'and', 'in'].includes(term)
  );
  if (!terms.length) {
    return mediaEntries;
  }
  const request = { terms, phrase: normalize(query), fuzzy };
  return documents
    .flatMap((document) => scoreDocument(document, request))
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label, 'en'))
    .map(({ entry }) => entry);
}

type SearchDocument = (typeof documents)[number];
interface SearchRequest {
  terms: string[];
  phrase: string;
  fuzzy: boolean;
}

function termScore(document: SearchDocument, term: string, fuzzy: boolean) {
  const fields = [
    { words: document.title, weight: 12, fuzzy },
    { words: document.detail, weight: 5, fuzzy },
    { words: document.path, weight: 3, fuzzy: false },
    { words: document.context, weight: 1, fuzzy: false },
  ];
  const exact = fields.some((field) => matchWeight(term, field.words, false) > 0);
  const match = Math.max(...fields.map((field) => matchWeight(term, field.words, field.fuzzy) * field.weight));
  return { match, penalty: exact ? 0 : 1000 };
}

function scoreDocument(document: SearchDocument, request: SearchRequest) {
  const scores = request.terms.map((term) => termScore(document, term, request.fuzzy));
  if (scores.some(({ match }) => !match)) {
    return [];
  }
  const titleBonus = document.name === request.phrase ? 1000 : Number(document.name.includes(request.phrase)) * 100;
  return [
    { entry: document.entry, score: scores.reduce((score, term) => score + term.match - term.penalty, titleBonus) },
  ];
}

function cataloguePredicates(search: MediaSearch) {
  const kind = (entry: MediaEntry) => search.kind === 'all' || search.kind === entry.kind;
  const subject = (entry: MediaEntry) => !search.subject || entry.subjects.includes(search.subject);
  const collection = (entry: MediaEntry) => !search.group || entry.collection === search.group;
  const all = (entry: MediaEntry) => [kind, subject, collection].every((predicate) => predicate(entry));
  return { kind, subject, collection, all };
}

type CataloguePredicates = ReturnType<typeof cataloguePredicates>;

function catalogueFacets(candidates: MediaEntry[], predicates: CataloguePredicates) {
  const collections = [...new Set(mediaEntries.filter(predicates.kind).map((entry) => entry.collection))].sort((a, b) =>
    a.localeCompare(b, 'en')
  );
  const kindCounts = mediaKinds.map((kind) => ({
    ...kind,
    count: candidates
      .filter(predicates.subject)
      .filter(predicates.collection)
      .filter((entry) => entry.kind === kind.value).length,
  }));
  const subjectCounts = mediaSubjects.map((subject) => ({
    ...subject,
    count: candidates
      .filter(predicates.kind)
      .filter(predicates.collection)
      .filter((entry) => entry.subjects.includes(subject.value)).length,
  }));
  const collectionCounts = collections.map((collection) => ({
    value: collection,
    label: collection,
    count: candidates
      .filter(predicates.kind)
      .filter(predicates.subject)
      .filter((entry) => entry.collection === collection).length,
  }));
  return { collections, kindCounts, subjectCounts, collectionCounts };
}

function groupsByCollection(entry: MediaEntry, search: MediaSearch) {
  return ['leader', 'decal'].includes(entry.kind) || search.browse === 'collection';
}

function groupLabel(entry: MediaEntry, search: MediaSearch) {
  if (groupsByCollection(entry, search)) {
    return entry.collection;
  }
  if (search.q.trim()) {
    return 'Other results';
  }
  return subjectLabel(search.subject ?? entry.subjects[0]!);
}

function catalogueGroups(matches: MediaEntry[], search: MediaSearch) {
  const groupOf = (entry: MediaEntry) => groupLabel(entry, search);
  const ordered = search.q.trim()
    ? matches
    : [...matches].sort((a, b) => groupOf(a).localeCompare(groupOf(b), 'en') || a.label.localeCompare(b.label, 'en'));
  return [...new Set(ordered.map(groupOf))].map((label) => {
    const entries = ordered.filter((entry) => groupOf(entry) === label);
    const first = entries[0]!;
    const collection = groupsByCollection(first, search) ? first.collection : undefined;
    const total = collection ? mediaEntries.filter((entry) => entry.collection === collection).length : entries.length;
    return { label, entries, collection, total, kind: first.kind };
  });
}

export function filterCatalogue(search: MediaSearch) {
  const predicates = cataloguePredicates(search);
  const candidates = searchMedia(search.q);
  const matches = candidates.filter(predicates.all);
  const approximate = matches.length > 0 && !searchMedia(search.q, false).some(predicates.all);
  return { matches, groups: catalogueGroups(matches, search), ...catalogueFacets(candidates, predicates), approximate };
}
