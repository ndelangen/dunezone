import type { StoredPiece } from '@shared/play/model';
import type { GameSnapshot, PieceAction } from '@shared/play/protocol';
import type { TutorialCheckpoint } from '@shared/tutorial/recipe';

import type { GuideTask } from '../TutorialGuide';

/** The other players at a chapter's table, whom a task can have act, as their own seat sends a command. */
export type TablePlayers = Readonly<{
  /** Sends one command as `seat` would; a refusal is the table's, as for any player. */
  act: (seat: string, action: PieceAction) => void;
  /** The table as `seat` sees it. */
  viewOf: (seat: string) => GameSnapshot;
  /** Every seat at the table but the learner's. */
  others: () => readonly string[];
}>;

/** What a built chapter plays: the setup checkpoint its table starts from, and its tasks over that table. */
export type ChapterScript = Readonly<{
  slug: string;
  checkpoint: TutorialCheckpoint;
  /** The faction the learner plays this chapter as, by its name at the table; the recipe's learner seat when absent. */
  playAs?: string;
  /** Pieces the learner holds in this chapter besides what the setup dealt, with their images under `{{origin}}` as the setup names them. */
  hand?: readonly StoredPiece[];
  /** What the other players do as the table opens, before the learner sees it, such as moving the game on to the chapter's phase. */
  opening?: (players: TablePlayers) => void;
  /** The chapter's tasks, in order, reading the table as the learner sees it. */
  tasks: (snapshot: () => GameSnapshot, players: TablePlayers) => GuideTask[];
  /** What the learner can do once the chapter is done, one short line each, listed on its end screen. */
  learned: readonly string[];
}>;
