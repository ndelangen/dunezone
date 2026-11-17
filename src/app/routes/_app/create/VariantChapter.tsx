import type { AnyRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { TutorialGuide } from '@app/widgets/tutorial-guide/TutorialGuide';

import { SandboxApp } from '../../../db/sandbox/SandboxApp';
import { PRACTICE_VIEWER, practiceDatabase } from './practiceDatabase';
import { practiceCopy } from './practicePageChecks';
import { VARIANT_TUTORIAL_LEARNED, VARIANT_TUTORIAL_START, VARIANT_TUTORIAL_TASKS } from './variantTutorialTasks';

/*
 * Storybook's router framework swaps Link for one that only reports the press, so in a story no link opens anything.
 * This chapter's learner moves between pages by their links, so under Storybook the practice copy follows its own.
 */
function followLinksUnderStorybook(router: () => AnyRouter | undefined): () => void {
  if (!import.meta.env.STORYBOOK) {
    return () => undefined;
  }
  const follow = (event: MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest('[data-tutorial-pages] a[href^="/"]') : null;
    if (link) {
      void router()?.navigate({ href: link.getAttribute('href')! });
    }
  };
  document.addEventListener('click', follow);
  return () => document.removeEventListener('click', follow);
}

/*
 * The variant tutorial's page: the rail beside a practice copy of the site, opened on the faction catalogue.
 * Reset starts a fresh copy, so the variant the learner made is gone with it.
 */
export default function VariantChapter({
  number,
  title,
  loading,
  chaptersLink,
}: Readonly<{
  number: number;
  title: string;
  /** Shown while the practice copy starts. */
  loading: ReactNode;
  chaptersLink: (props: object) => ReactNode;
}>) {
  const [copy] = useState(practiceCopy);
  const [tasks] = useState(() => VARIANT_TUTORIAL_TASKS(copy.page));
  useEffect(() => followLinksUnderStorybook(copy.router), [copy]);
  const [run, setRun] = useState(0);
  return (
    <TutorialGuide
      number={number}
      title={title}
      tasks={tasks}
      learned={VARIANT_TUTORIAL_LEARNED}
      onReset={() => setRun((current) => current + 1)}
      chaptersLink={chaptersLink}
    >
      <SandboxApp
        key={run}
        database={practiceDatabase}
        identity={PRACTICE_VIEWER}
        path={VARIANT_TUTORIAL_START}
        onReady={copy.ready}
        loading={loading}
      />
    </TutorialGuide>
  );
}
