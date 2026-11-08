import { useAuthActions } from '@convex-dev/auth/react';
import { fn, mocked } from 'storybook/test';

/* The browser remembers the provider it last finished signing in with, so the story plants that memory before the page reads it. */
export const lastSignedInWithDiscord = () => {
  localStorage.setItem('dunezone-last-sign-in', 'discord');
  return () => localStorage.removeItem('dunezone-last-sign-in');
};

/* The tab that left for Steam keeps its sign-in under this key, and only a return carrying the same `state` may spend it. */
const STEAM_SIGN_IN_KEY = 'dunezone-steam-sign-in';
const STEAM_STORY_STATE = 'steam-story';

/** The address Steam returns the tab to: a positive answer for one Steam account, carrying the `state` the tab left with. */
export const steamReturnPath = `/auth/steam?${new URLSearchParams({
  state: STEAM_STORY_STATE,
  'openid.ns': 'http://specs.openid.net/auth/2.0',
  'openid.mode': 'id_res',
  'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
  'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000001',
  'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000001',
  'openid.return_to': `https://storybook.invalid/auth/steam?state=${STEAM_STORY_STATE}`,
  'openid.response_nonce': '2026-10-10T12:00:00Zstorybook',
  'openid.assoc_handle': '1234567890',
  'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
  'openid.sig': 'c3Rvcnlib29r',
})}`;

/**
 * The tab is back from Steam and the backend has not answered yet.
 * The pending sign-in is the one the tab left with, and the sign-in call is held open, so the page keeps its pending state instead of moving on.
 */
export const backFromSteamAwaitingTheBackend = () => {
  sessionStorage.setItem(STEAM_SIGN_IN_KEY, JSON.stringify({ state: STEAM_STORY_STATE, redirectTo: '/' }));
  const actions = mocked(useAuthActions);
  actions.mockReturnValue({
    signIn: fn(() => new Promise<never>(() => {})),
    signOut: fn(async () => {}),
  });
  return () => {
    sessionStorage.removeItem(STEAM_SIGN_IN_KEY);
    actions.mockRestore();
  };
};
