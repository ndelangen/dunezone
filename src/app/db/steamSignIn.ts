import { steamSignInUrl } from '@shared/steamOpenId';

/* The tab that leaves for Steam keeps its state and destination; an address alone cannot finish someone else's sign-in. */
const STEAM_SIGN_IN_KEY = 'dunezone-steam-sign-in';

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Sends the tab to Steam, which returns it to the Steam return page; throws when the browser refuses storage, since the sign-in could not finish. */
export function startSteamSignIn(redirectTo: string): { redirect: URL; signingIn: false } {
  const state = randomState();
  sessionStorage.setItem(STEAM_SIGN_IN_KEY, JSON.stringify({ state, redirectTo }));
  const redirect = steamSignInUrl(new URL(window.location.origin), state);
  window.location.assign(redirect);
  return { redirect, signingIn: false };
}

/** Spends this tab's pending Steam sign-in: its destination when `state` is the one it left with, otherwise `null`. */
export function takeSteamSignIn(state: string | null): string | null {
  try {
    const stored = sessionStorage.getItem(STEAM_SIGN_IN_KEY);
    sessionStorage.removeItem(STEAM_SIGN_IN_KEY);
    const pending = stored ? (JSON.parse(stored) as { state?: unknown; redirectTo?: unknown }) : null;
    const ours = !!state && pending?.state === state;
    return ours && typeof pending.redirectTo === 'string' ? pending.redirectTo : null;
  } catch {
    return null;
  }
}
