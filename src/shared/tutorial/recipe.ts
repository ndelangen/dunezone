/*
 * The one game every tutorial chapter starts from (Norbert, 2026-10-23: one shared setup, live art).
 * `bun run tutorial:pull` copies this content from the public catalogue into `src/app/routes/_app/tutorial/setup/catalogue.json`,
 * and `bun run tutorial:record` plays it on the real game Worker into `src/app/routes/_app/tutorial/setup/setup.json`, one stored table per checkpoint.
 * To change the setup: edit this file, run both, and review the JSON diff.
 */

export const TUTORIAL_RECIPE = {
  /* The official Dreamrules ruleset, by its production id. */
  ruleset: { id: 'kx7banekz1ft7w9wtka1w6rxh584832y', slug: 'dreamrules' },
  /* The six official factions, by slug, in the seat order the draft deals them to. */
  factions: ['bene-gesserit', 'house-atreides', 'house-harkonnen', 'emperor', 'spacing-guild', 'fremen'],
  /* The seat the learner plays. */
  learner: 'seat-1',
} as const;

/** The named places in the setup a chapter can start from, in the order the recording reaches them. */
export const TUTORIAL_CHECKPOINTS = ['drafting', 'setup', 'turn-1-storm'] as const;
export type TutorialCheckpoint = (typeof TUTORIAL_CHECKPOINTS)[number];
