/*
 * Match whole words in names, so lore and ordinary words such as assassin, Scunthorpe and cockatoo stay usable.
 * Ambiguous words such as Dick, ass, cock, prick and bastard require the provider's context judgment.
 * Generated suffixes have no wording to preserve, so their check also rejects embedded matches and ambiguous words.
 */
const PROFANE_WORDS = [
  'fuck',
  'fucks',
  'fucked',
  'fucking',
  'fucker',
  'fuckers',
  'fuckhead',
  'motherfucker',
  'motherfuckers',
  'motherfucking',
  'shit',
  'shits',
  'shitty',
  'shitting',
  'shithead',
  'shitheads',
  'bullshit',
  'bitch',
  'bitches',
  'bitching',
  'asshole',
  'assholes',
  'arse',
  'arsehole',
  'arseholes',
  'dumbass',
  'jackass',
  'dipshit',
  'cunt',
  'cunts',
  'dickhead',
  'dickheads',
  'wank',
  'wanker',
  'wankers',
  'wanking',
  'bollocks',
  'twat',
  'twats',
  'douchebag',
  'douchebags',
  'crap',
  'crappy',
  'piss',
  'pissed',
  'pissing',
  'damn',
  'damned',
] as const;

const LETTER_FORMS: Readonly<Record<string, string>> = {
  a: '[a4@*]',
  b: '[b8]',
  e: '[e3*]',
  i: '[i1!*]',
  o: '[o0*]',
  s: '[s5$]',
  t: '[t7+]',
  u: '[u*]',
};
const SEPARATOR_CHARACTER = '[\\s\\p{P}\\p{S}]';
/* A digit counts as a letter unless it stands alone between separators, so "Top 5 hits" and its address top-5-hits spell nothing while "5h1t" still does. */
function letterForm(letter: string) {
  const form = LETTER_FORMS[letter];
  if (!form) {
    return letter;
  }
  const digits = form.slice(1, -1).replace(/\D/g, '');
  const others = form.replace(/\d/g, '');
  const joined = `[^${SEPARATOR_CHARACTER.slice(1, -1)}]`;
  const alone = `(?<!${joined})[${digits}](?!${joined})`;
  return digits ? `(?:${others}|(?!${alone})[${digits}])` : form;
}
const SEPARATOR = `${SEPARATOR_CHARACTER}{0,3}`;
const WORD_PATTERNS = PROFANE_WORDS.map((word) => [...word].map(letterForm).join(SEPARATOR)).join('|');
const WHOLE_WORD = new RegExp(`(?<![\\p{L}\\p{N}])(?:${WORD_PATTERNS})(?![\\p{L}\\p{N}])`, 'u');
const SUFFIX_WORD = new RegExp(`${WORD_PATTERNS}|bastard|ass|cock|dick|prick`, 'u');
/* Matching the base character includes presentation selectors and skin-tone variants. */
const OFFENSIVE_GESTURE = /\u{1F595}/u;

function foldedWords(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '');
}

/** A local positive is definitive even when the provider is unavailable. */
export function hasLocalPlayGameProfanity(value: string): boolean {
  return OFFENSIVE_GESTURE.test(value) || WHOLE_WORD.test(foldedWords(value));
}

/** Every allocated address is checked, including the newly generated collision suffix. */
export function acceptsPlayGameAddress(base: string, candidate: string): boolean {
  if (hasLocalPlayGameProfanity(candidate)) {
    return false;
  }
  const suffix = candidate.startsWith(`${base}-`) ? candidate.slice(base.length + 1) : '';
  return !SUFFIX_WORD.test(suffix);
}
