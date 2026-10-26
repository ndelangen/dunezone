/*
 * The tutorial's chapters, in the order a new player meets them (Norbert, 2026-10-23: a player's path).
 * The landing page shows them as tiles in rows by part (layout A), so a player can start anywhere and still read the whole path in order.
 * Each chapter teaches how the Play tool works, never the game's rules: faction rules are authored content.
 */

export type TutorialPart = 'Getting into a game' | 'The table' | 'Playing' | 'Beyond the basics';

export const TUTORIAL_PARTS: readonly TutorialPart[] = [
  'Getting into a game',
  'The table',
  'Playing',
  'Beyond the basics',
];

export type TutorialChapter = Readonly<{
  slug: string;
  number: number;
  title: string;
  /** What a player can do once the chapter is done, in one line. */
  goal: string;
  minutes: number;
  part: TutorialPart;
}>;

const CHAPTERS: readonly Omit<TutorialChapter, 'number'>[] = [
  {
    slug: 'welcome',
    title: 'Welcome',
    goal: 'Play is a table, not a referee',
    minutes: 3,
    part: 'Getting into a game',
  },
  {
    slug: 'find-or-create',
    title: 'Find or create a game',
    goal: 'Create a game and share its link',
    minutes: 3,
    part: 'Getting into a game',
  },
  {
    slug: 'take-a-seat',
    title: 'Take a seat',
    goal: 'Ask for a seat, watch, or leave',
    minutes: 2,
    part: 'Getting into a game',
  },
  {
    slug: 'draft-and-trade',
    title: 'Draft and trade',
    goal: 'Draft a faction, then swap',
    minutes: 4,
    part: 'Getting into a game',
  },
  {
    slug: 'what-goes-where',
    title: 'What goes where',
    goal: 'Name every part of the screen',
    minutes: 4,
    part: 'The table',
  },
  {
    slug: 'looking-around',
    title: 'Looking around',
    goal: 'Zoom, slide, turn the view and read a card close up',
    minutes: 3,
    part: 'The table',
  },
  {
    slug: 'moving-pieces',
    title: 'Moving pieces',
    goal: 'Split, carry and flip stacks, shuffle and peek',
    minutes: 5,
    part: 'The table',
  },
  {
    slug: 'windows',
    title: 'Windows',
    goal: 'Open windows with the compass or a letter, then pin and resize them',
    minutes: 4,
    part: 'The table',
  },
  {
    slug: 'your-hand-and-spice',
    title: 'Your hand and spice',
    goal: 'Take cards into your hand, play them, withdraw spice',
    minutes: 3,
    part: 'The table',
  },
  {
    slug: 'the-private-side-table',
    title: 'The private side-table',
    goal: 'Track your Kwisatz Haderach on a card of your own',
    minutes: 3,
    part: 'The table',
  },
  {
    slug: 'setup',
    title: 'Setup',
    goal: 'Place troops, pick traitors, lock a prediction',
    minutes: 4,
    part: 'Playing',
  },
  {
    slug: 'phases-and-turns',
    title: 'Phases and turns',
    goal: 'Move on, and see what holds a phase',
    minutes: 3,
    part: 'Playing',
  },
  {
    slug: 'bidding',
    title: 'Bidding',
    goal: 'Run a round with the bidder',
    minutes: 4,
    part: 'Playing',
  },
  {
    slug: 'battle',
    title: 'Battle',
    goal: 'From the battle marker to Resolve battle',
    minutes: 6,
    part: 'Playing',
  },
  {
    slug: 'alliances-and-talking',
    title: 'Alliances and talking',
    goal: 'Ally up and message other players',
    minutes: 3,
    part: 'Playing',
  },
  {
    slug: 'bring-your-own-pieces',
    title: 'Bring your own pieces',
    goal: 'Add custom decks and bundles',
    minutes: 4,
    part: 'Beyond the basics',
  },
  {
    slug: 'ending-a-game',
    title: 'Ending a game',
    goal: 'Call the winner, or vote a player off',
    minutes: 2,
    part: 'Beyond the basics',
  },
];

export const TUTORIAL_CHAPTERS: readonly TutorialChapter[] = CHAPTERS.map((chapter, index) => ({
  ...chapter,
  number: index + 1,
}));

/** A chapter by its slug. */
export const chapterAt = (slug: string): TutorialChapter | undefined =>
  TUTORIAL_CHAPTERS.find((chapter) => chapter.slug === slug);

/*
 * The picture on a chapter's tile: a still of the Play table standing in for the live preview each tile will animate.
 * The stills are display copies in public/tutorial, named by the chapter's slug.
 */
export const chapterArt = (chapter: TutorialChapter) => `/tutorial/${chapter.slug}.webp`;
