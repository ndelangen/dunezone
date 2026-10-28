import { useContext, useState } from 'react';
import type { ReactNode } from 'react';

import type { TutorialChapter } from './chapters';
import type { ChapterScript } from './chapterScripts/chapterScript';
import { seatTutorialPlayers, TutorialPlayersContext, useTutorialPlayers } from './players';
import type { TutorialViewer } from './players';
import { PracticeTable, useTutorialTable } from './practiceTable';
import setup from './setup/setup.json';
import { startAt } from './setup/tutorialSetup';
import type { TutorialSetup } from './setup/tutorialSetup';
import { sceneTableLens } from './tableLens';
import { TutorialGuide } from './TutorialGuide';

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
  viewer,
}: Readonly<{
  chapter: TutorialChapter;
  script: ChapterScript;
  /** The task the chapter opens at, counted from 0. */
  firstTask?: number;
  chaptersLink: (props: object) => ReactNode;
  nextLink?: ((props: object) => ReactNode) | undefined;
  exit: ReactNode;
  viewer: TutorialViewer;
}>) {
  /* Reset starts the controls afresh as well, so a pinned window from the last run cannot do a task for the player. */
  const [controlsEpoch, setControlsEpoch] = useState(0);
  const people = useTutorialPlayers(viewer);
  const fixedPlayers = useContext(TutorialPlayersContext);
  const [seated] = useState(() => seatTutorialPlayers(setup as unknown as TutorialSetup, people, script));
  const { runtime, control } = useTutorialTable(
    seated,
    () => startAt(seated, script.checkpoint, window.location.origin, script),
    script.opening
  );
  const [tasks] = useState(() => script.tasks(control.snapshot, control.players, fixedPlayers ? () => 0 : Math.random));
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
      <PracticeTable
        runtime={runtime}
        title={chapter.title}
        exit={exit}
        controlsEpoch={controlsEpoch}
        identity={{ rulesetName: 'Dreamrules', address: 'tutorial', page: `/tutorial/${chapter.slug}` }}
      />
    </TutorialGuide>
  );
}
