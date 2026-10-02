/*
 * Password secrets for the hosted-play launcher's synthetic accounts (#1493).
 * By default Convex Auth's Password checks a password with Lucia's Scrypt inside the `auth:store` mutation.
 * On CI's macOS runner that took a median 0.2 s of the backend's function limit at every sign-in,
 * and a stall of the runner during it ended one sign-in at the limit.
 * The launcher's accounts have random 48-hex-digit passwords, 192 bits of entropy. A key derivation's work factor
 * multiplies the cost of guessing a password by its iteration count (NIST SP 800-132, appendix A.2.2), which matters for a
 * password a person chose and not for one that takes up to 2^192 guesses. So these accounts use PBKDF2-HMAC-SHA256 at the
 * 1,000 iterations NIST recommends as a minimum (section 5.2), which takes about a millisecond.
 * Production keeps E2E_LOCAL_AUTH off (docs/deployment.md), so it registers no Password provider at all.
 * A hosted deployment's own URL is never on a loopback host either, so none uses PBKDF2 whatever its settings,
 * and every backend but the launcher's keeps Scrypt.
 */
import { isIsolatedLoopbackBackend } from './isolatedBackend';

/** NIST SP 800-132's recommended minimum, which the copies in `scripts/lib/synthetic-accounts.ts` and `scripts/verify-hosted-play.mjs` repeat. */
const ITERATIONS = 1000;

/** The stored form: `pbkdf2-sha256:`, the 16-byte salt in hex, a colon and the 32-byte key in hex, with the salt's hex text as the salt. */
const PBKDF2_SECRET = /^pbkdf2-sha256:([a-f0-9]{32}):([a-f0-9]{64})$/;

/**
 * Whether this backend's Password provider stores and checks PBKDF2 instead of Scrypt.
 * Only an isolated loopback backend with `PLAY_TEST_PASSWORD_HASH=pbkdf2` does, and the hosted-play launcher sets that on its own backend.
 */
export function checksPbkdf2Passwords() {
  return process.env.PLAY_TEST_PASSWORD_HASH === 'pbkdf2' && isIsolatedLoopbackBackend();
}

/** Whether `secret` is in the stored form of a PBKDF2 secret, whichever password it matches. */
export function isPbkdf2Secret(secret: string) {
  return PBKDF2_SECRET.test(secret);
}

function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function derive(salt: string, password: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const parameters = { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: ITERATIONS };
  return hex(await crypto.subtle.deriveBits(parameters, key, 256));
}

/** Compares two hex keys in time that depends only on their length. */
function sameKey(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    difference |= (left.codePointAt(index) ?? 0) ^ (right.codePointAt(index) ?? 0);
  }
  return difference === 0;
}

/**
 * The `crypto` option for Password on a backend that checks PBKDF2, and undefined on every other backend.
 * Password replaces its whole default `crypto` with this option, so a caller passes it only when it is defined.
 */
export function pbkdf2PasswordCrypto() {
  if (!checksPbkdf2Passwords()) {
    return undefined;
  }
  return {
    async hashSecret(password: string) {
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const key = await derive(salt, password);
      return `pbkdf2-sha256:${salt}:${key}`;
    },
    async verifySecret(password: string, secret: string) {
      const match = PBKDF2_SECRET.exec(secret);
      return match !== null && sameKey(await derive(match[1]!, password), match[2]!);
    },
  };
}
