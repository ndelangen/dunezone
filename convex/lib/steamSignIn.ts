import { parseSteamAssertion, STEAM_OPENID_ENDPOINT, steamConfirmed } from '../../src/shared/steamOpenId';

const STEAM_TIMEOUT_MS = 10_000;

export type SteamLogin = { steamId: string; nonce: string; name?: string; image?: string };

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
  return { steamId: assertion.steamId, nonce: assertion.nonce, ...(await steamProfile(assertion.steamId)) };
}

/** The public name and avatar a Steam player summary carries, leaving out anything missing or unsafe to show. */
function playerProfile(player: Record<string, unknown> | undefined): { name?: string; image?: string } {
  const name = typeof player?.personaname === 'string' ? player.personaname.trim().slice(0, 64) : '';
  const avatar = typeof player?.avatarfull === 'string' ? player.avatarfull : '';
  return { ...(name ? { name } : {}), ...(avatar.startsWith('https://') ? { image: avatar } : {}) };
}

/* The profile is a convenience: a missing key, a private profile or a slow Steam API only leaves it blank. */
async function steamProfile(steamId: string): Promise<{ name?: string; image?: string }> {
  const key = process.env.STEAM_WEB_API_KEY;
  if (!key) {
    return {};
  }
  try {
    const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
    url.search = new URLSearchParams({ key, steamids: steamId }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(STEAM_TIMEOUT_MS) });
    if (!response.ok) {
      return {};
    }
    const body = (await response.json()) as { response?: { players?: Record<string, unknown>[] } };
    return playerProfile(body.response?.players?.[0]);
  } catch {
    return {};
  }
}
