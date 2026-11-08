/*
 * Steam signs people in with OpenID 2.0, not OAuth, so it cannot ride Convex Auth's OAuth round trip.
 * The browser goes to Steam and comes back to `STEAM_RETURN_PATH` with a signed assertion, and the backend
 * asks Steam to confirm that assertion before it signs anyone in.
 */

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
export const STEAM_RETURN_PATH = '/auth/steam';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** How old Steam's assertion may be when the backend checks it; a real round trip takes seconds. */
export const STEAM_ASSERTION_MAX_AGE_MS = 5 * 60_000;

/** The Steam sign-in address for a site, returning to that site with `state` so the tab can tell its own sign-in from a planted one. */
export function steamSignInUrl(siteOrigin: string, state: string): string {
  const returnTo = new URL(STEAM_RETURN_PATH, siteOrigin);
  returnTo.searchParams.set('state', state);
  const url = new URL(STEAM_OPENID_ENDPOINT);
  url.search = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo.toString(),
    'openid.realm': new URL(siteOrigin).origin,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  }).toString();
  return url.toString();
}

/** The `openid.*` fields Steam put on the return address, which the backend needs to check the assertion. */
export function steamAssertionFrom(search: URLSearchParams): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of search) {
    if (key.startsWith('openid.')) {
      fields[key] = value;
    }
  }
  return fields;
}

export type SteamAssertion = { steamId: string; nonce: string; checkBody: URLSearchParams };

/**
 * Reads a returned assertion without trusting it yet: it must be a positive Steam answer, addressed to this site's return page, recent, and signed over the fields that matter.
 * Returns `null` for anything else.
 * Only Steam's `check_authentication` answer, which the caller still has to get, proves it is genuine.
 */
export function parseSteamAssertion(
  fields: Record<string, unknown>,
  siteUrl: string,
  now: number
): SteamAssertion | null {
  const field = (name: string) => {
    const value = fields[`openid.${name}`];
    return typeof value === 'string' ? value : null;
  };
  if (
    field('ns') !== OPENID_NS ||
    field('mode') !== 'id_res' ||
    field('op_endpoint') !== STEAM_OPENID_ENDPOINT ||
    field('claimed_id') !== field('identity')
  ) {
    return null;
  }
  const steamId = CLAIMED_ID.exec(field('claimed_id') ?? '')?.[1];
  if (!steamId) {
    return null;
  }
  let returnTo: URL;
  let site: URL;
  try {
    returnTo = new URL(field('return_to') ?? '');
    site = new URL(siteUrl);
  } catch {
    return null;
  }
  if (returnTo.origin !== site.origin || returnTo.pathname !== STEAM_RETURN_PATH) {
    return null;
  }
  const nonce = field('response_nonce') ?? '';
  const issued = Date.parse(nonce.slice(0, 20));
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(nonce) || nonce.length > 255 || Number.isNaN(issued)) {
    return null;
  }
  if (issued > now + 60_000 || now - issued > STEAM_ASSERTION_MAX_AGE_MS) {
    return null;
  }
  const signed = new Set((field('signed') ?? '').split(','));
  for (const required of ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle']) {
    if (!signed.has(required)) {
      return null;
    }
  }
  if (!field('sig') || !field('assoc_handle')) {
    return null;
  }
  const checkBody = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('openid.') && typeof value === 'string') {
      checkBody.set(key, value);
    }
  }
  checkBody.set('openid.mode', 'check_authentication');
  return { steamId, nonce, checkBody };
}

/** Whether Steam's `check_authentication` answer, in OpenID's key-value form, confirms the assertion. */
export function steamConfirmed(body: string): boolean {
  return body.split('\n').some((line) => line.trim() === 'is_valid:true');
}
