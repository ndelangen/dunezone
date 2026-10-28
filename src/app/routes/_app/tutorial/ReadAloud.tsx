import { KeyedText } from '@ui/content/Kbd';
import { IconAction } from '@ui/control/IconAction';
import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
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

const PREFERENCE = 'dunezone-tutorial:speaking-mode';

function rememberedMode(): boolean | null {
  try {
    const stored = localStorage.getItem(PREFERENCE);
    return stored === 'true' ? true : stored === 'false' ? false : null;
  } catch {
    return null;
  }
}

/** Keeps the learner's speaking preference while each active step supplies its description. */
export function ReadAloud({
  text,
  stepKey,
  introduce = false,
}: Readonly<{ text: string | null; stepKey: string; introduce?: boolean }>) {
  const speech = useSpeech();
  const [preference, setPreference] = useState(rememberedMode);
  const enabled = preference === true;
  const shouldSpeak = enabled || (introduce && preference === null);
  const { supported, speak, stop } = speech;

  useEffect(() => {
    if (preference !== null) {
      try {
        localStorage.setItem(PREFERENCE, String(preference));
      } catch {
        /* Blocked storage still permits a choice for this chapter. */
      }
    }
  }, [preference]);

  useEffect(() => {
    if (supported && text && shouldSpeak) {
      speak(spokenText(text));
    }
    return stop;
  }, [supported, text, stepKey, shouldSpeak, speak, stop]);

  const changeMode = () => {
    if (enabled) {
      stop();
    }
    setPreference(!enabled);
  };
  const keyboardToggle = useEffectEvent(changeMode);
  useEffect(() => {
    if (!supported) {
      return;
    }
    const press = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.key.toLowerCase() !== 'z' ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]')))
      ) {
        return;
      }
      event.preventDefault();
      keyboardToggle();
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, [supported]);

  if (!speech.supported) {
    return null;
  }
  /* Like Reset, a click lets go of its focus, so a task's Space or Enter reaches the table rather than pressing this again. */
  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    changeMode();
  };
  const label = enabled ? 'Turn speaking mode off' : 'Turn speaking mode on';
  return (
    <IconAction
      label={label}
      tooltip={<KeyedText>{`${label} {Z}`}</KeyedText>}
      emphasis="quiet"
      size="lg"
      pressed={enabled}
      className={styles.button}
      data-speaking-mode
      data-attention={introduce && preference === null ? '' : undefined}
      aria-keyshortcuts="Z"
      icon={
        speech.speaking ? <Speaking /> : enabled ? <Volume2 size={18} aria-hidden /> : <VolumeX size={18} aria-hidden />
      }
      onClick={toggle}
    />
  );
}
