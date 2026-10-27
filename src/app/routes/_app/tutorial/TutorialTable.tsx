import { AssetCapture } from '@shared/play/assetCapture';
import type { GameSnapshot } from '@shared/play/protocol';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { readAssetSupply } from '@db/play';
import { useCurrentProfile } from '@db/profiles';

import { CompassEpochContext } from '../play/compass/compassEpoch';
import { RememberedContext } from '../play/compass/useRemembered';
import { GameRuntimeContext } from '../play/multiplayer/gameRuntime';
import HostedTable from '../play/multiplayer/HostedTable';
import type { TutorialChapter } from './chapters';
import type { ChapterScript, TablePlayers } from './chapterScripts/chapterScript';
import setup from './setup/setup.json';
import { startAt, withOrigin } from './setup/tutorialSetup';
import type { TutorialSetup } from './setup/tutorialSetup';
import { localRuntime } from './table/localRuntime';
import { LocalTable } from './table/localTable';
import { sceneTableLens } from './tableLens';
import { TutorialGuide } from './TutorialGuide';

/*
 * A chapter's live table: the Play table itself, connected to a game Worker table running in the page from the chapter's
 * checkpoint of the shared setup. Nothing reaches the game server; only a catalogue pick reads the public catalogue, as the picker does.
 * Reset puts the table back as the chapter started.
 * This module carries the Worker's table code and the setup, so the chapter page loads it lazily, and only in the browser.
 */

/** What a chapter's guide reads and does on its table. */
type TutorialTableControl = Readonly<{
  /** The table as the learner sees it now. */
  snapshot: () => GameSnapshot;
  /** Puts the table back as the chapter started, on the connection the page already holds. */
  reset: () => void;
  /** The other players, whom a chapter's tasks can have act. */
  players: TablePlayers;
}>;

/* The other players at a local table, acting on whichever table `local` gives, so they follow the table across a Reset. */
function playersAt(local: () => LocalTable): TablePlayers {
  return {
    act: (seat, action) => {
      /* The table answers another seat's move with a frame to the page, as the Worker broadcasts it. */
      const table = local();
      table.receive(
        { type: 'command', commandId: crypto.randomUUID(), action, expectedRevision: table.room.snapshot.revision },
        seat
      );
    },
    viewOf: (seat) => local().frame(seat).snapshot,
    others: () =>
      local()
        .seats()
        .filter((seat) => seat !== local().seat),
    landings: () => local().landings(),
  };
}

function useTutorialTable(setup: TutorialSetup, chapter: ChapterScript) {
  /* The players at the table greet the learner by their own name when they answer a chat message. */
  const username = useCurrentProfile().data?.username ?? undefined;
  const [table] = useState(() => {
    const origin = window.location.origin;
    const open = () => {
      const local = new LocalTable(startAt(setup, chapter.checkpoint, origin, chapter));
      local.open();
      chapter.opening?.(playersAt(() => local));
      return local;
    };
    const holder = { current: open() };
    const runtime = localRuntime(
      () => holder.current,
      withOrigin(setup.factions, origin),
      new AssetCapture(readAssetSupply, origin)
    );
    /* The guide asks every frame, so the table is projected again only once its room has moved on. */
    let seen: { room: unknown; snapshot: GameSnapshot } | undefined;
    const control: TutorialTableControl = {
      snapshot: () => {
        const room = holder.current.room.snapshot;
        if (seen?.room !== room) {
          seen = { room, snapshot: holder.current.frame().snapshot };
        }
        return seen.snapshot;
      },
      players: playersAt(() => holder.current),
      reset: () => {
        const { deliver } = holder.current;
        holder.current.dispose();
        holder.current = open();
        holder.current.deliver = deliver;
        /* A page replaying the old table leaves its replay only on a fresh connection, so it reconnects onto the new table. */
        if (runtime.replaying()) {
          runtime.reconnect();
          return;
        }
        deliver(holder.current.frame());
      },
    };
    return { runtime, control, holder };
  });
  useEffect(() => table.runtime.greet(username), [table, username]);
  /* The table keeps time only while the chapter is open, so leaving it stops the table's timers. */
  useEffect(() => {
    const { holder, runtime } = table;
    holder.current.open();
    return () => {
      holder.current.dispose();
      runtime.dispose();
    };
  }, [table]);
  return table;
}

/**
 * A built chapter as a player meets it: the rail with one task at a time beside the live table, and the table itself.
 * The camera returns to the map view on Reset, zoom and all, by choosing that view again.
 */
export default function ChapterPlay({
  chapter,
  script,
  firstTask = 0,
  chaptersLink,
  nextLink,
  exit,
}: Readonly<{
  chapter: TutorialChapter;
  script: ChapterScript;
  /** The task the chapter opens at, counted from 0. */
  firstTask?: number;
  chaptersLink: (props: object) => ReactNode;
  nextLink?: ((props: object) => ReactNode) | undefined;
  exit: ReactNode;
}>) {
  /* Reset starts the controls afresh as well, so a pinned window from the last run cannot do a task for the player. */
  const [controlsEpoch, setControlsEpoch] = useState(0);
  const { runtime, control } = useTutorialTable(setup as unknown as TutorialSetup, script);
  const [tasks] = useState(() => script.tasks(control.snapshot, control.players));
  return (
    <TutorialGuide
      number={chapter.number}
      title={chapter.title}
      tasks={tasks}
      table={sceneTableLens}
      firstTask={firstTask}
      learned={script.learned}
      onReset={() => {
        control.reset();
        setControlsEpoch((epoch) => epoch + 1);
        document.querySelector<HTMLButtonElement>('[aria-label^="Focus on map"]')?.click();
      }}
      chaptersLink={chaptersLink}
      nextLink={nextLink}
    >
      <PageLayout height="fullscreen">
        <PageLayout.Header size="compact">
          <PageTitle title={chapter.title} />
        </PageLayout.Header>
        <PageLayout.Content width="viewport">
          <GameRuntimeContext value={runtime}>
            {/* A chapter starts from a clean screen and leaves the player's own game layout alone: nothing it pins or resizes is remembered. */}
            <RememberedContext value={false}>
              <CompassEpochContext value={controlsEpoch}>
                <HostedTable
                  gameId="tutorial"
                  exitControl={exit}
                  identity={{ rulesetName: 'Dreamrules', address: 'tutorial', page: `/tutorial/${chapter.slug}` }}
                />
              </CompassEpochContext>
            </RememberedContext>
          </GameRuntimeContext>
        </PageLayout.Content>
      </PageLayout>
    </TutorialGuide>
  );
}
