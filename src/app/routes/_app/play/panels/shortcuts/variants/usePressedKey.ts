import { useEffect, useEffectEvent, useState } from 'react';

import { capOfEvent, capOfKey } from './shortcutCatalogue';

/** The last key pressed that the sheet lists, with a count that changes on every press so a repeat replays its animation. */
export type Pressed = Readonly<{ key: string; count: number }> | null;

function typing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select') !== null)
  );
}

/**
 * Hears the keys the sheet lists while it is open, so a variant can light the cap the player just pressed.
 * Keys typed into a field stay the field's.
 * `onPress` may claim a key, which stops the table from also acting on it.
 */
export function usePressedKey(
  onPress?: (key: string, event: KeyboardEvent) => boolean | void,
  { everyKey = false }: Readonly<{ everyKey?: boolean }> = {}
): Pressed {
  const [pressed, setPressed] = useState<Pressed>(null);
  const run = useEffectEvent((key: string, event: KeyboardEvent) => onPress?.(key, event));
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || typing(event.target)) {
        return;
      }
      const key = everyKey ? capOfKey(event) : capOfEvent(event);
      if (!key) {
        return;
      }
      if (run(key, event) === true) {
        event.preventDefault();
      }
      setPressed((last) => ({ key, count: (last?.count ?? 0) + 1 }));
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [everyKey]);
  return pressed;
}
