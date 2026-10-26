import type { StoredPiece } from '@shared/play/model';
import type { GameSnapshot } from '@shared/play/protocol';
import type { TutorialCheckpoint } from '@shared/tutorial/recipe';

import type { GuideTask } from '../TutorialGuide';

/** What a built chapter plays: the setup checkpoint its table starts from, and its tasks over that table. */
export type ChapterScript = Readonly<{
  slug: string;
  checkpoint: TutorialCheckpoint;
  /** The faction the learner plays this chapter as, by its name at the table; the recipe's learner seat when absent. */
  playAs?: string;
  /** Pieces the learner holds in this chapter besides what the setup dealt, with their images under `{{origin}}` as the setup names them. */
  hand?: readonly StoredPiece[];
  /** The chapter's tasks, in order, reading the table as the learner sees it. */
  tasks: (snapshot: () => GameSnapshot) => GuideTask[];
  /** What the learner can do once the chapter is done, one short line each, listed on its end screen. */
  learned: readonly string[];
}>;
