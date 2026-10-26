import { IconAction } from '@ui/control/IconAction';
import { Volume2 } from 'lucide-react';
import type { MouseEvent } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import styles from './ReadAloud.module.css';
import { spokenText, useSpeech } from './speech';

/* A voice at work: three bars that rise and fall out of step, or hold still at their own heights without motion. */
function Speaking() {
  const motion = useMotionAllowed();
  return (
    <span className={styles.speaking} data-motion={motion ? undefined : 'reduce'} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * Reads a text aloud on a press, with its key caps said by name, and stops at once on the next press.
 * The voice stops too as the button goes;
 * where the browser has no voice there is no button.
 */
export function ReadAloud({ text }: Readonly<{ text: string }>) {
  const speech = useSpeech();
  if (!speech.supported) {
    return null;
  }
  /* Like Reset, a click lets go of its focus, so a task's Space or Enter reaches the table rather than pressing this again. */
  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    if (speech.speaking) {
      speech.stop();
    } else {
      speech.speak(spokenText(text));
    }
  };
  return (
    <IconAction
      label={speech.speaking ? 'Stop reading' : 'Read aloud'}
      emphasis="quiet"
      size="lg"
      pressed={speech.speaking}
      className={styles.button}
      icon={speech.speaking ? <Speaking /> : <Volume2 size={18} aria-hidden />}
      onClick={toggle}
    />
  );
}
