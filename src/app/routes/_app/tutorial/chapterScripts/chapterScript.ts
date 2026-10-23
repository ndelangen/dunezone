import type { GameSnapshot } from '@shared/play/protocol';
import type { TutorialCheckpoint } from '@shared/tutorial/recipe';

import type { GuideTask } from '../TutorialGuide';

/** What a built chapter plays: the setup checkpoint its table starts from, and its tasks over that table. */
export type ChapterScript = Readonly<{
  slug: string;
  checkpoint: TutorialCheckpoint;
  /** The chapter's tasks, in order, reading the table as the learner sees it. */
  tasks: (snapshot: () => GameSnapshot) => GuideTask[];
}>;
