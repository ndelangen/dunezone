import { useEffect, useEffectEvent, useState } from 'react';

import { isTypingTarget } from '../../typingTarget';
import { capOfEvent } from './keyboardShortcuts';

/** The last listed key pressed, with a count that changes on every press so a repeat replays its animation. */
export type Pressed = Readonly<{ key: string; count: number }> | null;

/* The modifier a chord leans on; the table ignores chords, but a lone Ctrl or Alt is a key it answers to. */
const CHORD_MODIFIERS = [
  ['ctrlKey', 'Control'],
  ['altKey', 'Alt'],
  ['metaKey', 'Meta'],
] as const;

/* Whether the key was pressed with Cmd, Ctrl or Alt held, other than that modifier on its own. */
function chord(event: KeyboardEvent) {
  return CHORD_MODIFIERS.some(([held, key]) => event[held] && event.key !== key);
}

/* A held key's repeats, a chord and typing in a field light nothing. */
function ignored(event: KeyboardEvent) {
  if (event.repeat) {
    return true;
  }
  if (chord(event)) {
    return true;
  }
  return isTypingTarget(event.target);
}

/**
 * Hears the listed keys while the shortcuts window is open, so it can light the cap the player just pressed.
 * It only listens: the key still does what it does at the table.
 * Keys typed into a field stay the field's.
 */
export function usePressedKey(onPress?: (key: string) => void): Pressed {
  const [pressed, setPressed] = useState<Pressed>(null);
  const run = useEffectEvent((key: string) => onPress?.(key));
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (ignored(event)) {
        return;
      }
      const key = capOfEvent(event);
      if (!key) {
        return;
      }
      run(key);
      setPressed((last) => ({ key, count: (last?.count ?? 0) + 1 }));
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  return pressed;
}
