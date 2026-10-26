import type { PublicFaction } from '@shared/play/capture';
import type { LogEntry, LogTab } from '@shared/play/log';
import type { GameSnapshot, Viewer } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { TUTORIAL_RECIPE } from '@shared/tutorial/recipe';
import type { TutorialCheckpoint } from '@shared/tutorial/recipe';

import { onCurrentBoard } from '../../../../../../workers/game/boardLayoutSnapshot';
import { storedSnapshotSchema } from '../../../../../../workers/game/state';
import type { ChapterScript } from '../chapterScripts/chapterScript';
import type { RecordedDeal } from '../table/localSession';
import type { TableStart } from '../table/localTable';

/*
 * The tutorial's shared setup as `bun run tutorial:record` wrote it: one stored table per checkpoint, the seats' viewers,
 * the names at the table, the faction sheets and the log. Its images are the site's live `/published/...` addresses, under `{{origin}}`.
 */

export type TutorialSetup = Readonly<{
  factions: Readonly<Record<string, PublicFaction | null>>;
  checkpoints: Readonly<
    Record<
      TutorialCheckpoint,
      Readonly<{
        title: string;
        logSequence: number;
        stored: unknown;
        viewers: Readonly<Record<string, Viewer>>;
        players: NonNullable<GameSnapshot['controls']>['players'];
      }>
    >
  >;
  log: Partial<Record<LogTab, LogEntry[]>>;
}>;

/** A recorded value with its images under the page's own origin, since the recording names them under `{{origin}}`. */
export const withOrigin = <Value>(value: Value, origin: string): Value =>
  JSON.parse(JSON.stringify(value).replaceAll('{{origin}}', origin)) as Value;

/* A recorded stored table, through the Worker's own migration, with its images under the page's origin. */
const storedAt = (setup: TutorialSetup, checkpoint: TutorialCheckpoint, origin: string) =>
  storedSnapshotSchema.parse(
    onCurrentBoard(withOrigin(setup.checkpoints[checkpoint].stored, origin) as Parameters<typeof onCurrentBoard>[0])
  );

/*
 * How the recording dealt: each seat's faction and station at setup, with the faction token trading showed for it,
 * so a draft played from the drafting checkpoint deals the factions the later chapters expect.
 */
function recordedDeal(setup: TutorialSetup, origin: string): RecordedDeal {
  const dealt = storedAt(setup, 'setup', origin);
  return (dealt.roster?.seats ?? []).flatMap((seat) =>
    seat.faction
      ? [
          {
            seat: seat.id,
            factionId: seat.faction.id,
            position: seat.position,
            token: dealt.swapping?.tokens?.[seat.id],
          },
        ]
      : []
  );
}

/**
 * Where a chapter's table starts: the checkpoint's stored table, as the learner's seat sees it.
 * A chapter that plays as another faction sees it from that faction's seat, a watching chapter from the spectator's, and a chapter's own pieces are in that seat's hand.
 * The stored table goes through the Worker's own migration, as a live game's does after a deploy, so an older recording still opens.
 * A table before the deal also runs the session's draft, and deals as the recording dealt.
 */
export function startAt(
  setup: TutorialSetup,
  checkpoint: TutorialCheckpoint,
  origin: string,
  chapter: Pick<ChapterScript, 'playAs' | 'hand' | 'watch'> = {}
): TableStart {
  const point = setup.checkpoints[checkpoint];
  const stored = storedAt(setup, checkpoint, origin);
  const seated = stored.roster?.seats.find((entry) =>
    chapter.playAs ? entry.faction?.name === chapter.playAs : entry.id === TUTORIAL_RECIPE.learner
  );
  const faction = seated?.faction?.id;
  if (faction && chapter.hand) {
    stored.factionInventories[faction] = [
      ...(stored.factionInventories[faction] ?? []),
      ...withOrigin(chapter.hand, origin).map((piece) => ({ ...piece, owner: faction })),
    ];
  }
  return {
    stored,
    /* Each seat has a connection of its own, so carries keep their owners apart. */
    viewers: Object.fromEntries(
      Object.entries(point.viewers).map(([seat, viewer]) => [seat, { ...viewer, connectionId: `tutorial-${seat}` }])
    ),
    players: point.players,
    log: {
      game: (setup.log.game ?? []).filter((entry) => entry.sequence <= point.logSequence),
      audit: setup.log.audit ?? [],
    },
    seat: chapter.watch ? SPECTATOR_SEAT : (seated?.id ?? TUTORIAL_RECIPE.learner),
    /* Before the deal the table also runs the session's draft, trading and seat requests. */
    ...(stored.stage === 'drafting' && stored.draft
      ? { draft: { minimumPlayers: stored.draft.minimum, deal: recordedDeal(setup, origin) } }
      : {}),
  };
}
