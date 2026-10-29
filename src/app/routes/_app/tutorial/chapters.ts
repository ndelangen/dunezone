/*
 * The tutorial's chapters, in the order a new player meets them (Norbert, 2026-10-23: a player's path).
 * The landing page shows them as tiles in rows by part (layout A), so a player can start anywhere and still read the whole path in order.
 * Each chapter teaches how the Play tool works, never the game's rules: faction rules are authored content.
 */

export type TutorialPart = 'Getting into a game' | 'Using the table' | 'Playing a game' | 'Beyond the basics';

export const TUTORIAL_PARTS: readonly TutorialPart[] = [
  'Getting into a game',
  'Using the table',
  'Playing a game',
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
    goal: 'Read the screen, move the game on, and share its link',
    minutes: 3,
    part: 'Getting into a game',
  },
  {
    slug: 'create-a-game',
    title: 'Create your own game',
    goal: 'Choose the settings, name your game and open the table',
    minutes: 3,
    part: 'Getting into a game',
  },
  {
    slug: 'find-a-game',
    title: 'Join an existing game',
    goal: 'Find a friend and open their table',
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
    slug: 'looking-around',
    title: 'Looking around',
    goal: 'Zoom, slide, turn the view, ping and read a card close up',
    minutes: 3,
    part: 'Using the table',
  },
  {
    slug: 'moving-pieces',
    title: 'Moving pieces',
    goal: 'Move a piece, carry a stack, then split, combine and flip it',
    minutes: 5,
    part: 'Using the table',
  },
  {
    slug: 'windows',
    title: 'Windows',
    goal: 'Open windows with the compass or a letter, then pin and resize them',
    minutes: 4,
    part: 'Using the table',
  },
  {
    slug: 'your-hand-and-spice',
    title: 'Your hand and spice',
    goal: 'Take cards into your hand, sort and play them, withdraw spice',
    minutes: 3,
    part: 'Using the table',
  },
  {
    slug: 'decks-and-dealing',
    title: 'Decks and dealing',
    goal: 'Shuffle, peek and reorder, deal, split and take two at once',
    minutes: 4,
    part: 'Using the table',
  },
  {
    slug: 'what-goes-where',
    title: 'What goes where',
    goal: 'Use the decks, Tanks and reserves through a turn',
    minutes: 4,
    part: 'Using the table',
  },
  {
    slug: 'setup',
    title: 'Setup',
    goal: 'Place troops, pick traitors, lock a prediction, find your Extras',
    minutes: 4,
    part: 'Playing a game',
  },
  {
    slug: 'phases-and-turns',
    title: 'Phases and turns',
    goal: 'Move on, and see what holds a phase',
    minutes: 3,
    part: 'Playing a game',
  },
  {
    slug: 'alliances-and-talking',
    title: 'Talking & Alliances',
    goal: 'Ally up, message players and look up their faction',
    minutes: 3,
    part: 'Playing a game',
  },
  {
    slug: 'bidding',
    title: 'Bidding',
    goal: 'Run a round with the bidder and its letter keys',
    minutes: 4,
    part: 'Playing a game',
  },
  {
    slug: 'battle',
    title: 'Battle',
    goal: 'From the battle marker through the Battle plan to Resolve battle',
    minutes: 6,
    part: 'Playing a game',
  },
  {
    slug: 'ending-a-game',
    title: 'Ending a game',
    goal: 'Declare a result, replay the game, then continue playing',
    minutes: 3,
    part: 'Playing a game',
  },
  {
    slug: 'the-private-side-table',
    title: 'The private side-table',
    goal: 'Track your Kwisatz Haderach on a card of your own',
    minutes: 3,
    part: 'Beyond the basics',
  },
  {
    slug: 'bring-your-own-pieces',
    title: 'Bring your own pieces',
    goal: 'Bring in a token from the catalogue, with another player approving it',
    minutes: 4,
    part: 'Beyond the basics',
  },
  {
    slug: 'mentat-recall',
    title: 'Mentat recall',
    goal: 'Explore frozen history together, inspect your inventory and use recall chat',
    minutes: 6,
    part: 'Beyond the basics',
  },
  {
    slug: 'moderation',
    title: 'Moderation and disputes',
    goal: 'Check the log, vote to remove an absent player and read the audit',
    minutes: 3,
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
export const chapterArt = (chapter: TutorialChapter) =>
  `/tutorial/${chapter.slug === 'mentat-recall' ? 'moderation' : ['find-a-game', 'create-a-game'].includes(chapter.slug) ? 'find-or-create' : chapter.slug}.webp`;
