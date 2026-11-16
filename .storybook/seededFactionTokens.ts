/*
 * The token each seeded faction shows, by the id the Storybook database gives it.
 * The database numbers rows in the order it seeds them, so these ids are the baseline's House Atreides and the five factions the
 * battle wheel stories seat after it, from Play's product fixture.
 * The dev server answers them in `storyBoardFace.ts`, the static build in `static/_redirects`; a test holds the two to this list,
 * and a battle wheel story checks the search still shows these ids for these factions.
 */
export const SEEDED_FACTION_TOKENS = {
  '000000000000000000010007factions': 'house-atreides',
  '000000000000000000010015factions': 'house-harkonnen',
  '000000000000000000010022factions': 'emperor',
  '000000000000000000010029factions': 'spacing-guild',
  '000000000000000000010036factions': 'fremen',
  '000000000000000000010043factions': 'bene-gesserit',
} as const;

/** Where the static build keeps a seeded faction's token. */
export const seededTokenFixture = (slug: string) => `/play-fixtures/product/${slug}-token.jpg`;
