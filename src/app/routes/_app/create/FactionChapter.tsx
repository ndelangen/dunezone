import { LoadPending } from '@ui/block/LoadPending';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { NewFactionDraft } from '@app/widgets/faction-editor/newFactionDraft';

import { SandboxApp } from '../../../db/sandbox/SandboxApp';
import type { SandboxControls } from '../../../db/sandbox/SandboxApp';
import { TutorialGuide } from '../tutorial/TutorialGuide';
import { blankFaction, draftAfter } from './blankFaction';
import { FACTION_TUTORIAL_LEARNED, FACTION_TUTORIAL_TASKS } from './factionTutorialTasks';
import { PRACTICE_VIEWER, practiceDatabase } from './practiceDatabase';

/*
 * The faction tutorial's page: the rail beside a practice copy of the site, opened on the faction creator.
 * Reset starts a fresh copy, so everything the learner made is gone with it.
 */
export default function FactionChapter({
  number,
  title,
  firstTask = 0,
  chaptersLink,
}: Readonly<{
  number: number;
  title: string;
  firstTask?: number;
  chaptersLink: (props: object) => ReactNode;
}>) {
  /*
   * The tasks read where the practice copy is through whichever copy is running now; a Reset starts another.
   * They read the page it has finished opening, so the rail moves on only once the learner sees that page.
   */
  const [chapter] = useState(() => {
    let controls: SandboxControls | null = null;
    return {
      ready: (next: SandboxControls) => {
        controls = next;
      },
      tasks: FACTION_TUTORIAL_TASKS({ pathname: () => controls?.router.state.resolvedLocation?.pathname ?? '' }),
    };
  });
  const [run, setRun] = useState(0);
  /* `?step` opens on what the earlier tasks would have made; Reset starts the chapter afresh from a blank faction. */
  const [deepLinkDraft] = useState(() => draftAfter(chapter.tasks.slice(0, firstTask).map((task) => task.id)));
  const loading = (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle eyebrow="Practice copy" title={title} />
      </PageLayout.Header>
      <PageLayout.Content>
        <LoadPending title="Opening a practice copy of Dune Zone">
          It runs in your browser, so nothing you make here is saved to the site.
        </LoadPending>
      </PageLayout.Content>
    </PageLayout>
  );
  return (
    <TutorialGuide
      number={number}
      title={title}
      tasks={chapter.tasks}
      firstTask={firstTask}
      learned={FACTION_TUTORIAL_LEARNED}
      onReset={() => setRun((current) => current + 1)}
      chaptersLink={chaptersLink}
    >
      <NewFactionDraft value={run === 0 ? deepLinkDraft : blankFaction}>
        <SandboxApp
          key={run}
          database={practiceDatabase}
          identity={PRACTICE_VIEWER}
          path="/factions/create"
          onReady={chapter.ready}
          loading={loading}
        />
      </NewFactionDraft>
    </TutorialGuide>
  );
}
