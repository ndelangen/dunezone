import { Stack, Text, Title } from '@mantine/core';
import { KeyedText } from '@ui/content/Kbd';
import { CallToAction } from '@ui/control/CallToAction';
import { Check } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { useMotionAllowed } from '../../../styles/motion';
import styles from './ChapterComplete.module.css';
import { ChapterConfetti } from './ChapterConfetti';

/*
 * The end of a chapter (Norbert, 2026-10-23): the table stops taking input under a veil, confetti flies,
 * and one button leads on, to the next chapter when that one is built or back to the chapter list when it is not.
 * What the chapter taught comes in one line at a time, and the button only after the last (Norbert, 2026-10-23).
 * The rail beside it stays usable, so Reset still plays the chapter again.
 */
export function ChapterComplete({
  learned,
  chaptersLink,
  nextLink,
}: Readonly<{
  learned: readonly string[];
  chaptersLink: (props: object) => ReactNode;
  nextLink?: ((props: object) => ReactNode) | undefined;
}>) {
  const heading = useId();
  const card = useRef<HTMLDivElement>(null);
  /* The site's own motion preference: without it the list and the button are all there at once. */
  const motion = useMotionAllowed();
  const focusOn = () => card.current?.querySelector<HTMLElement>('a, button')?.focus();
  /* Where focus was as the card opened; the button only takes it from there, never from a control the player chose meanwhile. */
  const opened = useRef<Element | null>(null);
  const focusOnUnlessMoved = () => {
    if (document.activeElement === opened.current || document.activeElement === document.body) {
      focusOn();
    }
  };

  /*
   * The table under the veil is inert, but its keys answer on the window, so they are stopped on the way down,
   * except in the rail and this card. Tab always passes, so focus can always move back to them.
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
    return () => window.removeEventListener('keydown', freeze, { capture: true });
  }, []);

  /* A hidden button cannot take focus, so with motion it takes focus once it has come in. */
  useEffect(() => {
    opened.current = document.activeElement;
    if (!motion) {
      focusOn();
    }
  }, [motion]);

  return (
    <>
      <div className={styles.veil}>
        <div
          ref={card}
          className={styles.complete}
          role="dialog"
          aria-labelledby={heading}
          data-tutorial-free
          data-motion={motion ? undefined : 'reduce'}
          style={{ '--learned-count': learned.length } as CSSProperties}
        >
          <Stack align="center" gap="md">
            <Title id={heading} order={2} ta="center">
              Chapter complete, congratulations!
            </Title>
            <Text fw={700} ta="center">
              What you learned
            </Text>
            <ul className={styles.learned}>
              {learned.map((line, order) => (
                <li key={line} style={{ '--learned-order': order } as CSSProperties}>
                  <span className={styles.tick} aria-hidden>
                    <Check size={16} strokeWidth={3} />
                  </span>
                  <span>
                    <KeyedText>{line}</KeyedText>
                  </span>
                </li>
              ))}
            </ul>
            <div
              className={styles.onward}
              onAnimationEnd={(event) => event.target === event.currentTarget && focusOnUnlessMoved()}
            >
              <CallToAction direction="forward" size="lg" attention renderRoot={nextLink ?? chaptersLink}>
                {nextLink ? 'Go to the next chapter' : 'Go back to the chapter list'}
              </CallToAction>
            </div>
          </Stack>
        </div>
      </div>
      <ChapterConfetti />
    </>
  );
}
