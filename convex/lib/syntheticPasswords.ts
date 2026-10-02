/*
 * Password secrets for the hosted-play launcher's synthetic accounts (#1493).
 * By default Convex Auth's Password checks a password with Lucia's Scrypt inside the `auth:store` mutation.
 * On CI's macOS runner that took a median 0.2 s of the backend's function limit at every sign-in,
 * and a stall of the runner during it ended one sign-in at the limit.
 * The launcher's accounts have random 48-hex-digit passwords. A slow hash only slows the guessing of a password a person chose,
 * and no hash makes a random 192-bit password guessable, so one salted SHA-256 serves as well here and takes a few milliseconds.
 * Production keeps E2E_LOCAL_AUTH off (docs/deployment.md), so it registers no Password provider at all.
 * A hosted deployment's own URL is never on a loopback host either, so none checks a digest whatever its settings, and every backend but the launcher's keeps Scrypt.
 */
import { isIsolatedLoopbackBackend } from './isolatedBackend';

/** The stored form of a digest: `sha256:`, a 16-byte hex salt, a colon and the hex SHA-256 of the salt, a colon and the password. */
const PASSWORD_DIGEST = /^sha256:([a-f0-9]{32}):([a-f0-9]{64})$/;

/**
 * Whether this backend's Password provider checks a salted SHA-256 instead of Scrypt.
 * Only an isolated loopback backend with `PLAY_TEST_PASSWORD_DIGEST=sha256` does, and the hosted-play launcher sets that on its own backend.
 */
export function checksPasswordDigest() {
  return process.env.PLAY_TEST_PASSWORD_DIGEST === 'sha256' && isIsolatedLoopbackBackend();
}

/** Whether `secret` is in the stored form of a digest; it says nothing about which password it matches. */
export function isPasswordDigest(secret: string) {
  return PASSWORD_DIGEST.test(secret);
}

function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(salt: string, password: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`)));
}

/** Compares two hex digests in time that depends only on their length. */
function sameDigest(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * The `crypto` option for Password on a backend that checks digests, and undefined on every other backend.
 * Password replaces its whole default `crypto` with this option, so a caller passes it only when it is defined.
 */
export function passwordDigestCrypto() {
  if (!checksPasswordDigest()) {
    return undefined;
  }
  return {
    async hashSecret(password: string) {
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      return `sha256:${salt}:${await digest(salt, password)}`;
    },
    async verifySecret(password: string, secret: string) {
      const match = PASSWORD_DIGEST.exec(secret);
      return match !== null && sameDigest(await digest(match[1]!, password), match[2]!);
    },
  };
}
