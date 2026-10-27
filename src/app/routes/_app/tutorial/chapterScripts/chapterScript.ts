import type { SpawnSelection } from '@shared/play/inventory';
import type { StoredPiece } from '@shared/play/model';
import type { GameSnapshot, PieceAction } from '@shared/play/protocol';
import type { TutorialCheckpoint } from '@shared/tutorial/recipe';

import type { Landing } from '../table/localTable';
import type { GuideTask } from '../TutorialGuide';

/** The other players at a chapter's table, whom a task can have act, as their own seat sends a command. */
export type TablePlayers = Readonly<{
  /** Sends one command as `seat` would; a refusal is the table's, as for any player. */
  act: (seat: string, action: PieceAction) => void;
  /** The table as `seat` sees it. */
  viewOf: (seat: string) => GameSnapshot;
  /** Every seat at the table but the learner's. */
  others: () => readonly string[];
  /** Every carry the learner has set down, oldest first. */
  landings: () => readonly Landing[];
  /** The asset a catalogue selection captured at this table, once the learner has requested it. */
  captured: (selection: SpawnSelection) => string | undefined;
}>;

/** What a built chapter plays: the setup checkpoint its table starts from, and its tasks over that table. */
export type ChapterScript = Readonly<{
  slug: string;
  checkpoint: TutorialCheckpoint;
  /** The faction the learner plays this chapter as, by its name at the table; the recipe's learner seat when absent. */
  playAs?: string;
  /** Whether the learner opens the table as a spectator, watching rather than seated. */
  watch?: boolean;
  /** Pieces the learner holds in this chapter besides what the setup dealt, with their images under `{{origin}}` as the setup names them. */
  hand?: readonly StoredPiece[];
  /** What the other players do as the table opens, before the learner sees it, such as moving the game on to the chapter's phase. */
  opening?: (players: TablePlayers) => void;
  /** The chapter's tasks, in order, reading the table as the learner sees it. */
  tasks: (snapshot: () => GameSnapshot, players: TablePlayers) => GuideTask[];
  /** What the learner can do once the chapter is done, one short line each, listed on its end screen. */
  learned: readonly string[];
}>;

/** Where a lobby chapter's player is: the lobby, the create page, or the game they just created. */
type LobbyView = 'lobby' | 'create' | 'created';

/** What a lobby chapter's tasks read: the page the player is on and what they chose there. */
export type LobbyState = Readonly<{
  view: LobbyView;
  /** What the lobby's search holds as the lobby opens; a chapter opened past the search starts with it typed. */
  query: string;
  /** Whether Create a game leads on to the create page; until the chapter gets there, the lobby keeps the learner on its steps. */
  createOpen: boolean;
  /** The ruleset the create page's pass holds, by name, once one is chosen. */
  ruleset: string | null;
  /** The game the player created, once they have. */
  created: Readonly<{ name: string; address: string }> | null;
}>;

/** A chapter played on the lobby and create pages, with sample games and no table. */
export type LobbyChapterScript = Readonly<{
  slug: string;
  page: 'lobby';
  /** The chapter's tasks, reading where the player is; a task calls `openCreate` once Create a game should lead on. */
  tasks: (state: () => LobbyState, openCreate: () => void) => GuideTask[];
  /** Where a chapter opened at a later task begins, so a direct link to it lands where its task can be done. */
  start: (firstTask: number) => LobbyState;
  learned: readonly string[];
}>;
