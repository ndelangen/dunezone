import { useEffect, useEffectEvent, useState } from 'react';

import { isTypingTarget } from '../../typingTarget';
import { capOfEvent } from './keyboardShortcuts';

/** The last listed key pressed, with a count that changes on every press so a repeat replays its animation. */
export type Pressed = Readonly<{ key: string; count: number }> | null;

/* A chord with Ctrl or Alt, unless it is that key itself, which the table answers to: the table ignores the chord too. */
function chord(event: KeyboardEvent) {
  return (event.ctrlKey && event.key !== 'Control') || (event.altKey && event.key !== 'Alt');
}

/* A held key's repeats, a Cmd, Ctrl or Alt chord and typing in a field light nothing. */
function ignored(event: KeyboardEvent) {
  if (event.repeat || event.metaKey || chord(event)) {
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
