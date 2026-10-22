const PLAY_GAME_NAME_MAX_LENGTH = 80;
const PLAY_GAME_SLUG_BASE_MAX_LENGTH = 64;
export const PLAY_RESERVED_GAME_ADDRESSES = ['create', 'demo', 'hosted'] as const;

/* Latin letters that NFKD leaves whole, spelled the way their languages write them in plain ASCII. */
const LATIN_LETTERS_WITHOUT_DECOMPOSITION: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
  ħ: 'h',
};

/** The same spelling rule applies to typed names, generated names and availability checks. */
export function normalizePlayGameSlug(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[ßæœøłđðþıħ]/gu, (letter) => LATIN_LETTERS_WITHOUT_DECOMPOSITION[letter] ?? letter)
    .replace(/['’ʼ]/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/\bgom-jabbar\b/g, 'gomjabbar')
    .replace(/^-|-$/g, '')
    .slice(0, PLAY_GAME_SLUG_BASE_MAX_LENGTH)
    .replace(/-$/g, '');
}

/** Returns canonical display wording and the shared rejection messages. */
export function inspectPlayGameName(value: string) {
  if (/\p{C}/u.test(value)) {
    return { name: value, issues: ['Game names cannot contain control or invisible characters.'] };
  }
  const name = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const issues: string[] = [];
  if (Array.from(name).length === 0 || Array.from(name).length > PLAY_GAME_NAME_MAX_LENGTH) {
    issues.push(`Use between 1 and ${PLAY_GAME_NAME_MAX_LENGTH} characters for the game name.`);
  }
  if (normalizePlayGameSlug(name).length === 0) {
    issues.push('Include a Latin letter or a number in the game name.');
  }
  return { name, issues };
}
