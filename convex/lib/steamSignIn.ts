import { parseSteamAssertion, STEAM_OPENID_ENDPOINT, steamConfirmed } from '../../src/shared/steamOpenId';

const STEAM_TIMEOUT_MS = 10_000;

export type SteamLogin = {
  steamId: string;
  nonce: string;
  name?: string;
  image?: string;
  /** How the profile lookup went, kept so a blank profile can be explained without the deployment's logs. */
  lookup: string;
};

/**
 * Checks a returned Steam assertion with Steam itself and, when a Web API key is configured, reads the player's public name and avatar.
 * Returns `null` when the assertion is malformed, stale, aimed at another site, over the check budget, or Steam does not confirm it.
 */
export async function verifySteamLogin(
  fields: Record<string, unknown>,
  siteUrl: string,
  admit: () => Promise<boolean>
): Promise<SteamLogin | null> {
  const assertion = parseSteamAssertion(fields, new URL(siteUrl), Date.now());
  /* Anyone can send a well-formed assertion with a made-up signature, so the requests to Steam share a budget. */
  if (!assertion || !(await admit())) {
    return null;
  }
  const check = await fetch(STEAM_OPENID_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: assertion.checkBody.toString(),
    signal: AbortSignal.timeout(STEAM_TIMEOUT_MS),
  });
  if (!check.ok || !steamConfirmed(await check.text())) {
    return null;
  }
  const { lookup, ...profile } = await steamProfile(assertion.steamId);
  return { steamId: assertion.steamId, nonce: assertion.nonce, ...profile, lookup };
}

/** The public name and avatar a Steam player summary carries, leaving out anything missing or unsafe to show. */
function playerProfile(player: Record<string, unknown> | undefined): { name?: string; image?: string } {
  const name = typeof player?.personaname === 'string' ? player.personaname.trim().slice(0, 64) : '';
  const avatar = typeof player?.avatarfull === 'string' ? player.avatarfull : '';
  return { ...(name ? { name } : {}), ...(avatar.startsWith('https://') ? { image: avatar } : {}) };
}

/** The player's current public name and avatar. The profile is a convenience: a missing key, a private profile or a slow Steam API only leaves it blank. */
export async function steamProfile(steamId: string): Promise<{ name?: string; image?: string; lookup: string }> {
  const key = process.env.STEAM_WEB_API_KEY?.trim();
  if (!key) {
    return blank('skipped: STEAM_WEB_API_KEY is not set');
  }
  try {
    const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
    url.search = new URLSearchParams({ key, steamids: steamId }).toString();
    const response = await fetch(url.href, { signal: AbortSignal.timeout(STEAM_TIMEOUT_MS) });
    if (!response.ok) {
      return blank(`failed with HTTP ${response.status}`);
    }
    const body = (await response.json()) as { response?: { players?: Record<string, unknown>[] } };
    const player = body.response?.players?.[0];
    if (!player) {
      return blank('returned no player');
    }
    const profile = playerProfile(player);
    return { ...profile, lookup: profile.name ? 'ok' : 'returned a player without a name' };
  } catch (error) {
    /* An error can quote the request address, which carries the key. */
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
    return blank(`failed: ${reason.split(key).join('***').slice(0, 200)}`);
  }
}

/* The sign-in still succeeds without a name or avatar; the log says why, without the key. */
function blank(reason: string) {
  console.warn(`Steam profile lookup ${reason}`);
  return { lookup: reason };
}
