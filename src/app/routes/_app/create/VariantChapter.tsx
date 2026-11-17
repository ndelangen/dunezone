import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { TutorialGuide } from '@app/widgets/tutorial-guide/TutorialGuide';

import { SandboxApp } from '../../../db/sandbox/SandboxApp';
import type { SandboxControls } from '../../../db/sandbox/SandboxApp';
import { PRACTICE_VIEWER, practiceDatabase } from './practiceDatabase';
import { VARIANT_TUTORIAL_LEARNED, VARIANT_TUTORIAL_START, VARIANT_TUTORIAL_TASKS } from './variantTutorialTasks';

/*
 * Storybook's router framework swaps Link for one that only reports the press, so in a story no link opens anything.
 * This chapter's learner moves between pages by their links, so under Storybook the practice copy follows its own.
 * On the site Link does that itself and this does nothing.
 * Returns what stops the following.
 */
function followLinksUnderStorybook({ router }: SandboxControls): () => void {
  if (!import.meta.env.STORYBOOK) {
    return () => undefined;
  }
  const follow = (event: MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest('[data-tutorial-pages] a[href^="/"]') : null;
    const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (link && plain) {
      void router.navigate({ href: link.getAttribute('href')! });
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
  /*
   * The tasks read where the practice copy is through whichever copy is running now; a Reset starts another.
   * They read the page it has finished opening, so the rail moves on only once the learner sees that page.
   */
  const [chapter] = useState(() => {
    let controls: SandboxControls | null = null;
    let unfollow = () => undefined as void;
    return {
      ready: (next: SandboxControls) => {
        controls = next;
        unfollow();
        unfollow = followLinksUnderStorybook(next);
      },
      leave: () => unfollow(),
      tasks: VARIANT_TUTORIAL_TASKS({ pathname: () => controls?.router.state.resolvedLocation?.pathname ?? '' }),
    };
  });
  useEffect(() => chapter.leave, [chapter]);
  const [run, setRun] = useState(0);
  return (
    <TutorialGuide
      number={number}
      title={title}
      tasks={chapter.tasks}
      learned={VARIANT_TUTORIAL_LEARNED}
      onReset={() => setRun((current) => current + 1)}
      chaptersLink={chaptersLink}
    >
      <SandboxApp
        key={run}
        database={practiceDatabase}
        identity={PRACTICE_VIEWER}
        path={VARIANT_TUTORIAL_START}
        onReady={chapter.ready}
        loading={loading}
      />
    </TutorialGuide>
  );
}
