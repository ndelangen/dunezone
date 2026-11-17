import { PageState } from '@ui/block/PageState';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { NewFactionDraft } from '@app/widgets/faction-editor/newFactionDraft';
import { TutorialGuide } from '@app/widgets/tutorial-guide/TutorialGuide';

import { SandboxApp } from '../../../db/sandbox/SandboxApp';
import { blankFaction, draftAfter } from './blankFaction';
import { FACTION_TUTORIAL_LEARNED, FACTION_TUTORIAL_TASKS } from './factionTutorialTasks';
import { PRACTICE_VIEWER, practiceDatabase } from './practiceDatabase';
import { practiceCopy } from './practicePageChecks';

/*
 * The faction tutorial's page: the rail beside a practice copy of the site, opened on the faction creator.
 * Reset starts a fresh copy, so everything the learner made is gone with it.
 */
export default function FactionChapter({
  number,
  title,
  firstTask = 0,
  chaptersLink,
  nextLink,
}: Readonly<{
  number: number;
  title: string;
  firstTask?: number;
  chaptersLink: (props: object) => ReactNode;
  nextLink: (props: object) => ReactNode;
}>) {
  const [copy] = useState(practiceCopy);
  const [tasks] = useState(() => FACTION_TUTORIAL_TASKS(copy.page));
  const [run, setRun] = useState(0);
  /* `?step` opens on what the earlier tasks would have made; Reset starts the chapter afresh from a blank faction. */
  const [deepLinkDraft] = useState(() => draftAfter(tasks.slice(0, firstTask).map((task) => task.id)));
  const loading = (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle eyebrow="Practice copy" title={title} />
      </PageLayout.Header>
      <PageLayout.Content>
        <PageState kind="pending" title="Opening a practice copy of Dune Zone">
          It runs in your browser, so nothing you make here is saved to the site.
        </PageState>
      </PageLayout.Content>
    </PageLayout>
  );
  return (
    <TutorialGuide
      number={number}
      title={title}
      tasks={tasks}
      firstTask={firstTask}
      learned={FACTION_TUTORIAL_LEARNED}
      onReset={() => setRun((current) => current + 1)}
      chaptersLink={chaptersLink}
      nextLink={nextLink}
    >
      <NewFactionDraft value={run === 0 ? deepLinkDraft : blankFaction}>
        <SandboxApp
          key={run}
          database={practiceDatabase}
          identity={PRACTICE_VIEWER}
          path="/factions/create"
          onReady={copy.ready}
          loading={loading}
        />
      </NewFactionDraft>
    </TutorialGuide>
  );
}
