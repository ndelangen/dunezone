import { installEngineHost } from '@shared/play/engine/host';
import type { EngineHost } from '@shared/play/engine/host';
import HmacSHA256 from 'crypto-js/hmac-sha256';

/*
 * The browser's side of the game engine's host, for the pages and stories that run a table in the page (the tutorial's
 * chapters, Pages / Play / Sandbox): Web Crypto's randomness and the page's clock. A browser table's secret guards
 * nothing, since the whole table is the learner's own, so its HMAC is crypto-js's, which answers synchronously as a
 * projection needs.
 */

/** A uniform integer in [0, max), as Node's `randomInt` answers. */
function randomInt(max: number): number {
  const supported = Number.isSafeInteger(max) && max > 0 && max <= 2 ** 32;
  if (!supported) {
    throw new RangeError(`randomInt needs a range of 1 to 2^32, not ${max}.`);
  }
  /* Rejection sampling keeps every value equally likely. */
  const limit = 2 ** 32 - (2 ** 32 % max);
  const word = new Uint32Array(1);
  do {
    crypto.getRandomValues(word);
  } while (word[0]! >= limit);
  return word[0]! % max;
}

export const browserEngineHost: EngineHost = {
  now: () => Date.now(),
  randomInt,
  randomUUID: () => crypto.randomUUID(),
  hmacSha256: (key, message) => HmacSHA256(message, key).toString(),
};

/* The local table imports this module, so the engine has its host before any table in the page is built. */
installEngineHost(browserEngineHost);
