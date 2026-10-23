import { Stack, Text, Title } from '@mantine/core';
import { CallToAction } from '@ui/control/CallToAction';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

import { ChapterConfetti } from './ChapterConfetti';
import styles from './TutorialGuide.module.css';

/*
 * The end of a chapter (Norbert, 2026-10-23): the table stops taking input under a veil, confetti flies,
 * and one button leads on, to the next chapter when that one is built or back to the chapter list when it is not.
 * The band above stays usable, so Reset still plays the chapter again.
 */
export function ChapterComplete({
  chaptersLink,
  nextLink,
}: Readonly<{
  chaptersLink: (props: object) => ReactNode;
  nextLink?: ((props: object) => ReactNode) | undefined;
}>) {
  const heading = useId();
  const card = useRef<HTMLDivElement>(null);

  /*
   * The table under the veil is inert, but its keys answer on the window, so they are stopped on the way down,
   * except in the band and this card. Tab always passes, so focus can always move back to them.
   */
  useEffect(() => {
    const freeze = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        return;
      }
      if (!(event.target instanceof Element && event.target.closest('[data-tutorial-free]'))) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', freeze, { capture: true });
    card.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => window.removeEventListener('keydown', freeze, { capture: true });
  }, []);

  return (
    <>
      <div className={styles.veil}>
        <div ref={card} className={styles.complete} role="dialog" aria-labelledby={heading} data-tutorial-free>
          <Stack align="center" gap="md">
            <Title id={heading} order={2} ta="center">
              Chapter complete, congratulations!
            </Title>
            <Text c="dimmed" ta="center">
              {nextLink ? 'The next chapter picks up where this one ends.' : 'Pick another chapter from the list.'}
            </Text>
            <CallToAction direction="forward" size="lg" attention renderRoot={nextLink ?? chaptersLink}>
              {nextLink ? 'Go to the next chapter' : 'Go back to the chapter list'}
            </CallToAction>
          </Stack>
        </div>
      </div>
      <ChapterConfetti />
    </>
  );
}
