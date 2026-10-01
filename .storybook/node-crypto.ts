import HmacSHA256 from 'crypto-js/hmac-sha256';

/*
 * The slice of Node's `node:crypto` the game Worker's table imports, for stories that run that table in the browser
 * (Pages / Play / Sandbox). Randomness comes from the Web Crypto API; nothing secret runs in a story.
 */

/** A uniform integer in [min, max), or [0, min) with one argument, as Node's `randomInt` answers. */
export function randomInt(min: number, max?: number): number {
  const [low, high] = max === undefined ? [0, min] : [min, max];
  const range = high - low;
  if (!Number.isSafeInteger(range) || range <= 0 || range > 2 ** 32) {
    throw new RangeError(`randomInt needs a range of 1 to 2^32, not ${range}.`);
  }
  /* Rejection sampling keeps every value equally likely. */
  const limit = 2 ** 32 - (2 ** 32 % range);
  const word = new Uint32Array(1);
  do {
    crypto.getRandomValues(word);
  } while (word[0]! >= limit);
  return low + (word[0]! % range);
}

export const randomUUID = () => crypto.randomUUID();

/** HMAC-SHA256 with the `update().digest('hex')` chain the table's card projection uses. */
export function createHmac(algorithm: string, key: string) {
  if (algorithm !== 'sha256') {
    throw new Error(`The Storybook crypto shim only computes sha256 HMACs, not ${algorithm}.`);
  }
  let message = '';
  const hmac = {
    update(data: string) {
      message += data;
      return hmac;
    },
    digest(encoding: 'hex') {
      if (encoding !== 'hex') {
        throw new Error(`The Storybook crypto shim only digests to hex, not ${encoding}.`);
      }
      return HmacSHA256(message, key).toString();
    },
  };
  return hmac;
}

export default { randomInt, randomUUID, createHmac };
