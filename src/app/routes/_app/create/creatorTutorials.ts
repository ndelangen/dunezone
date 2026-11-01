import type { LinkProps } from '@tanstack/react-router';

/*
 * The tutorials for making your own Dune content, listed at /create as the Play chapters are at /tutorial (Norbert, 2026-11-01).
 * They ship one at a time like the Play chapters, so a tutorial without a page shows as coming soon and opens nothing.
 * Each teaches a Dune Zone creator, never the game's rules.
 */

export type CreatorPart = 'Factions' | 'Cards, tokens and boards' | 'Rulesets and Rulebooks' | 'Working together';

export const CREATOR_PARTS: readonly CreatorPart[] = [
  'Factions',
  'Cards, tokens and boards',
  'Rulesets and Rulebooks',
  'Working together',
];

export type CreatorTutorial = Readonly<{
  slug: string;
  number: number;
  title: string;
  /** What a creator can do once the tutorial is done, in one line. */
  goal: string;
  minutes: number;
  part: CreatorPart;
  /** The tutorial's page, once it is written. */
  page?: LinkProps;
}>;

const TUTORIALS: readonly Omit<CreatorTutorial, 'number'>[] = [
  {
    slug: 'create-a-faction',
    title: 'Create a faction',
    goal: 'Name it, pick leaders and troops, write its rules and save a faction sheet',
    minutes: 10,
    part: 'Factions',
    page: { to: '/create/faction' },
  },
  {
    slug: 'write-faction-rules',
    title: 'Write rules and advantages',
    goal: 'Format rules text so it reads like the rest of the game',
    minutes: 5,
    part: 'Factions',
  },
  {
    slug: 'print-your-faction',
    title: 'Print your faction',
    goal: 'Print the sheet, shield, leader tokens and traitor cards',
    minutes: 4,
    part: 'Factions',
  },
  {
    slug: 'make-a-card',
    title: 'Make a card',
    goal: 'Make a treachery, spice or custom card of your own',
    minutes: 5,
    part: 'Cards, tokens and boards',
  },
  {
    slug: 'build-a-deck',
    title: 'Build a deck',
    goal: 'Gather cards into a deck and set how many of each',
    minutes: 4,
    part: 'Cards, tokens and boards',
  },
  {
    slug: 'make-tokens',
    title: 'Make tokens',
    goal: 'Make disc, plate and tech tokens for the rules a faction adds',
    minutes: 4,
    part: 'Cards, tokens and boards',
  },
  {
    slug: 'bundle-tokens',
    title: 'Bundle tokens',
    goal: 'Pack several tokens into one piece of setup',
    minutes: 3,
    part: 'Cards, tokens and boards',
  },
  {
    slug: 'make-a-board',
    title: 'Make a board',
    goal: 'Change territories, markings and artwork on the Dune board',
    minutes: 6,
    part: 'Cards, tokens and boards',
  },
  {
    slug: 'start-a-ruleset',
    title: 'Start a Ruleset',
    goal: 'Gather the factions and rules a game uses',
    minutes: 4,
    part: 'Rulesets and Rulebooks',
  },
  {
    slug: 'lay-out-a-rulebook',
    title: 'Lay out a Rulebook',
    goal: 'Add pages, place blocks and preview the print',
    minutes: 8,
    part: 'Rulesets and Rulebooks',
  },
  {
    slug: 'publish-an-edition',
    title: 'Publish an edition',
    goal: 'Freeze a Rulebook as a printable edition players can rely on',
    minutes: 3,
    part: 'Rulesets and Rulebooks',
  },
  {
    slug: 'write-an-faq',
    title: 'Answer FAQ questions',
    goal: 'Answer players and link the rule each answer rests on',
    minutes: 4,
    part: 'Rulesets and Rulebooks',
  },
  {
    slug: 'work-in-a-group',
    title: 'Work in a Group',
    goal: 'Invite friends and edit factions and Rulesets together',
    minutes: 3,
    part: 'Working together',
  },
  {
    slug: 'use-the-media-library',
    title: 'Use the media library',
    goal: 'Find portraits, troops, emblems and planets for your pieces',
    minutes: 3,
    part: 'Working together',
  },
  {
    slug: 'import-and-export',
    title: 'Import and export',
    goal: 'Back up your work and bring it into another Ruleset or Group',
    minutes: 3,
    part: 'Working together',
  },
];

export const CREATOR_TUTORIALS: readonly CreatorTutorial[] = TUTORIALS.map((tutorial, index) => ({
  ...tutorial,
  number: index + 1,
}));

/* The picture on a creator tutorial's tile: a still of the Dune Zone page it teaches, from public/tutorial/create. */
export const creatorArt = (tutorial: CreatorTutorial) => `/tutorial/create/${tutorial.slug}.webp`;
