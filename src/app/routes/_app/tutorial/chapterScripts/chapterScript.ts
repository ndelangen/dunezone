import type { SpawnSelection } from '@shared/play/inventory';
import type { StoredPiece, TablePiece } from '@shared/play/model';
import type { GameSnapshot, PieceAction } from '@shared/play/protocol';
import type { TutorialCheckpoint } from '@shared/tutorial/recipe';

import type { CreateGameDraft, CreateGameRequest } from '@app/widgets/create-game/CreateGamePass';
import type { LobbyView } from '@app/widgets/play-lobby/PlayLobby';

import type { AcceptedTutorialAction, Landing } from '../table/localTable';
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
  /** Commands the learner successfully committed, with their visible source before the command. */
  acceptedActions: () => readonly AcceptedTutorialAction[];
  /** Times the learner sent table pings, in milliseconds since the epoch. */
  pings: () => readonly number[];
  /** The asset a catalogue selection captured at this table, once the learner has requested it. */
  captured: (selection: SpawnSelection) => string | undefined;
  /** The selected token's pieces as the learner sees them after approval. */
  capturedPieces: (selection: SpawnSelection) => readonly TablePiece[];
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
  tasks: (snapshot: () => GameSnapshot, players: TablePlayers, random?: () => number) => GuideTask[];
  /** What the learner can do once the chapter is done, one short line each, listed on its end screen. */
  learned: readonly string[];
}>;

/** The lobby chapter owns both the form draft and the transition into its practice table. */
export type LobbyState = Readonly<{
  view: 'lobby' | 'create' | 'table';
  query: string;
  shown: LobbyView;
  draft: CreateGameDraft;
  actionOpen: boolean;
  opened: { kind: 'found'; address: string } | { kind: 'created'; request: CreateGameRequest } | null;
  tableReady: boolean;
}>;

export type LobbyChapterScript = Readonly<{
  slug: string;
  page: 'lobby';
  tasks: (state: () => LobbyState, unlock: () => void, friend: string) => GuideTask[];
  start: (firstTask: number, friend: string) => LobbyState;
  learned: readonly string[];
}>;
