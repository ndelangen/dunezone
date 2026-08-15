import { useSyncExternalStore } from 'react';

/*
 * Which color scheme this visitor sees — the `motion.ts` of appearance.
 *
 * The OS's `prefers-color-scheme` hint decides, unless localStorage (`dunezone-color-scheme`:
 * `light` | `dark`) says otherwise; System is the absence of an override. The resolved verdict is
 * mirrored onto `<html data-mantine-color-scheme>` — the attribute both tokens.css and Mantine key
 * off — by this module and, pre-hydration, by the inline script in the `_app` route's head. This
 * module is the only writer; `ApplicationChrome` relays the resolved value into Mantine via
 * `forceColorScheme`, and `AppFooter` owns the control that writes the preference. Bare routes
 * (print capture, publisher, auth) never run either writer and stay light by construction.
 */

const COLOR_SCHEME_STORAGE_KEY = 'dunezone-color-scheme';

export type SchemePreference = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

const listeners = new Set<() => void>();

function readPreference(): SchemePreference {
  try {
    const stored = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemScheme(): ResolvedScheme {
  // An environment without the media-query API (SSR, jsdom) cannot voice the hint; light it is.
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** The current verdict, for the provider's manager bridge; components use the hooks below. */
export function resolvedScheme(): ResolvedScheme {
  const preference = readPreference();
  return preference === 'system' ? systemScheme() : preference;
}

function applyAttribute(): void {
  document.documentElement.setAttribute('data-mantine-color-scheme', resolvedScheme());
}

/** `system` clears the override, returning the site to the OS hint. */
export function setSchemePreference(next: SchemePreference): void {
  try {
    if (next === 'system') {
      localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
    } else {
      localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next);
    }
  } catch {
    // Storage may be unavailable (private mode); the attribute still flips for this page view.
  }
  applyAttribute();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  const relay = () => {
    applyAttribute();
    listener();
  };
  listeners.add(listener);
  const hint =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  hint?.addEventListener('change', relay);
  // Another tab changing the preference reaches this one through the storage event.
  window.addEventListener('storage', relay);

  return () => {
    listeners.delete(listener);
    hint?.removeEventListener('change', relay);
    window.removeEventListener('storage', relay);
  };
}

/** The stored preference; `system` during server rendering. */
export function useSchemePreference(): SchemePreference {
  return useSyncExternalStore(subscribe, readPreference, () => 'system');
}

/** The live verdict; `light` during server rendering, settled in the same paint as hydration. */
export function useResolvedScheme(): ResolvedScheme {
  return useSyncExternalStore(subscribe, resolvedScheme, () => 'light');
}
