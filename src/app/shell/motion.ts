import { useSyncExternalStore } from 'react';

/*
 * Whether this visitor welcomes the chrome's ambient motion — the band video, the turning dice.
 *
 * The OS's `prefers-reduced-motion` hint decides, unless the site-local `motion` cookie
 * (`on` | `off`) says otherwise; the override exists so a visitor who quiets their whole OS can
 * still opt into this site's motion, and it is a cookie rather than storage so the server can one
 * day render the verdict into the first byte. `AppRoot` mirrors it onto `<html data-motion>` for
 * stylesheets to read, and `AppFooter` owns the switch that writes it.
 */

const listeners = new Set<() => void>();

function readOverride(): 'on' | 'off' | null {
  const match = /(?:^|;\s*)motion=(on|off)(?:;|$)/.exec(document.cookie);
  return match ? (match[1] as 'on' | 'off') : null;
}

function reducedByOs(): boolean {
  // An environment without the media-query API (jsdom) cannot voice the hint; motion is welcome.
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function motionAllowed(): boolean {
  const override = readOverride();
  return override === 'on' || (override !== 'off' && !reducedByOs());
}

/** `null` clears the override, returning the site to the OS hint. */
export function setMotionOverride(next: 'on' | 'off' | null): void {
  document.cookie = next
    ? `motion=${next}; path=/; max-age=31536000; samesite=lax`
    : 'motion=; path=/; max-age=0; samesite=lax';
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const hint =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  hint?.addEventListener('change', listener);

  return () => {
    listeners.delete(listener);
    hint?.removeEventListener('change', listener);
  };
}

/** The live verdict; `false` during server rendering, settled in the same paint as hydration. */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribe, motionAllowed, () => false);
}

export type MotionPreference = 'system' | 'on' | 'off';

/** The stored override, or `system` when the OS hint decides; `system` during server rendering. */
export function useMotionPreference(): MotionPreference {
  return useSyncExternalStore(
    subscribe,
    () => readOverride() ?? 'system',
    () => 'system'
  );
}
