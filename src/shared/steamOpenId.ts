/*
 * Steam signs people in with OpenID 2.0, not OAuth, so it cannot ride Convex Auth's OAuth round trip.
 * The browser goes to Steam and comes back to `STEAM_RETURN_PATH` with a signed assertion, and the backend
 * asks Steam to confirm that assertion before it signs anyone in.
 */

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const STEAM_RETURN_PATH = '/auth/steam';
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

type OpenIdField = (name: string) => string | null;

const SIGNED_FIELDS = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'];

/** A positive answer from Steam's own endpoint, for one Steam account, carrying its `steamId`. */
const POSITIVE_ANSWER: Record<string, string> = {
  ns: OPENID_NS,
  mode: 'id_res',
  op_endpoint: STEAM_OPENID_ENDPOINT,
};

function positiveSteamId(field: OpenIdField): string | null {
  const positive = Object.entries(POSITIVE_ANSWER).every(([name, expected]) => field(name) === expected);
  const claimed = field('claimed_id');
  const sameIdentity = positive && claimed === field('identity');
  return sameIdentity ? (CLAIMED_ID.exec(claimed ?? '')?.[1] ?? null) : null;
}

/** Whether the answer was sent back to this site's Steam return page. */
function addressedToSite(field: OpenIdField, siteUrl: string): boolean {
  try {
    const returnTo = new URL(field('return_to') ?? '');
    return returnTo.origin === new URL(siteUrl).origin && returnTo.pathname === STEAM_RETURN_PATH;
  } catch {
    return false;
  }
}

/** The answer's nonce, when its timestamp says Steam issued it within the accepted age. */
function recentNonce(field: OpenIdField, now: number): string | null {
  const nonce = field('response_nonce') ?? '';
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(nonce) || nonce.length > 255) {
    return null;
  }
  const issued = Date.parse(nonce.slice(0, 20));
  const fresh = issued <= now + 60_000 && now - issued <= STEAM_ASSERTION_MAX_AGE_MS;
  return fresh ? nonce : null;
}

/** Whether Steam's signature covers every field this check relies on. */
function signedOverEssentials(field: OpenIdField): boolean {
  const signed = new Set((field('signed') ?? '').split(','));
  const hasSignature = ['sig', 'assoc_handle'].every((name) => !!field(name));
  return hasSignature && SIGNED_FIELDS.every((name) => signed.has(name));
}

/** The same fields, as the `check_authentication` request that asks Steam to confirm them. */
function checkAuthenticationBody(fields: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('openid.') && typeof value === 'string') {
      body.set(key, value);
    }
  }
  body.set('openid.mode', 'check_authentication');
  return body;
}

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
  const field: OpenIdField = (name) => {
    const value = fields[`openid.${name}`];
    return typeof value === 'string' ? value : null;
  };
  const trustworthy = addressedToSite(field, siteUrl) && signedOverEssentials(field);
  const steamId = trustworthy ? positiveSteamId(field) : null;
  const nonce = steamId ? recentNonce(field, now) : null;
  return steamId && nonce ? { steamId, nonce, checkBody: checkAuthenticationBody(fields) } : null;
}

/** Whether Steam's `check_authentication` answer, in OpenID's key-value form, confirms the assertion. */
export function steamConfirmed(body: string): boolean {
  return body.split('\n').some((line) => line.trim() === 'is_valid:true');
}
