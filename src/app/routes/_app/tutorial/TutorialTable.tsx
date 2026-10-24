import type { GameSnapshot } from '@shared/play/protocol';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { forgetRemembered } from '../play/compass/useRemembered';
import { GameRuntimeContext } from '../play/multiplayer/gameRuntime';
import HostedTable from '../play/multiplayer/HostedTable';
import { TableControlsContext, TableControlsEpochContext } from '../play/tableControls';
import type { PlaytestChapter, TutorialChapter } from './chapters';
import type { ChapterScript } from './chapterScripts/chapterScript';
import setup from './setup/setup.json';
import { startAt, withOrigin } from './setup/tutorialSetup';
import type { TutorialSetup } from './setup/tutorialSetup';
import { localRuntime } from './table/localRuntime';
import { LocalTable } from './table/localTable';
import { TutorialGuide } from './TutorialGuide';

/*
 * A chapter's live table: the Play table itself, connected to a game Worker table running in the page from the chapter's
 * checkpoint of the shared setup. Nothing reaches the server, and Reset puts the table back as the chapter started.
 * This module carries the Worker's table code and the setup, so the chapter page loads it lazily, and only in the browser.
 */

/** What a chapter's guide reads and does on its table. */
type TutorialTableControl = Readonly<{
  /** The table as the learner sees it now. */
  snapshot: () => GameSnapshot;
  /** Puts the table back as the chapter started, on the connection the page already holds. */
  reset: () => void;
}>;

function useTutorialTable(setup: TutorialSetup, chapter: ChapterScript) {
  const [table] = useState(() => {
    const origin = window.location.origin;
    const open = () => {
      const local = new LocalTable(startAt(setup, chapter.checkpoint, origin));
      local.open();
      return local;
    };
    const holder = { current: open() };
    const runtime = localRuntime(() => holder.current, withOrigin(setup.factions, origin));
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
  /* The table keeps time only while the chapter is open, so leaving it stops the table's timers. */
  useEffect(() => {
    const { holder } = table;
    holder.current.open();
    return () => holder.current.dispose();
  }, [table]);
  return table;
}

/**
 * A built chapter as a player meets it: the band with one task at a time over the live table, and the table itself.
 * The camera returns to the map view on Reset, zoom and all, by choosing that view again.
 */
export default function ChapterPlay({
  chapter,
  script,
  chaptersLink,
  nextLink,
  exit,
}: Readonly<{
  chapter: TutorialChapter | PlaytestChapter;
  script: ChapterScript;
  chaptersLink: (props: object) => ReactNode;
  nextLink?: ((props: object) => ReactNode) | undefined;
  exit: ReactNode;
}>) {
  const compass = script.controls === 'compass';
  /* A play-test starts from a clean screen, with nothing pinned or resized by an earlier run. */
  useState(() => compass && forgetRemembered());
  /* Reset starts the controls afresh as well, so a pinned window from the last run cannot do a task for the player. */
  const [controlsEpoch, setControlsEpoch] = useState(0);
  const { runtime, control } = useTutorialTable(setup as unknown as TutorialSetup, script);
  const [tasks] = useState(() => script.tasks(control.snapshot));
  return (
    <TutorialGuide
      number={chapter.number}
      title={chapter.title}
      tasks={tasks}
      learned={script.learned}
      onReset={() => {
        control.reset();
        if (compass) {
          forgetRemembered();
          setControlsEpoch((epoch) => epoch + 1);
        }
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
            <TableControlsContext value={script.controls ?? 'classic'}>
              <TableControlsEpochContext value={controlsEpoch}>
                <HostedTable
                  gameId="tutorial"
                  exitControl={exit}
                  identity={{ rulesetName: 'Dreamrules', address: 'tutorial', page: `/tutorial/${chapter.slug}` }}
                />
              </TableControlsEpochContext>
            </TableControlsContext>
          </GameRuntimeContext>
        </PageLayout.Content>
      </PageLayout>
    </TutorialGuide>
  );
}
