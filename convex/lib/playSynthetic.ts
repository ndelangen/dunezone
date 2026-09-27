/*
 * The synthetic-backend seam for Play's test controls. The hosted load backend
 * (`scripts/play-load/hosted-backend.ts`) replaces this whole module with one bound to its target,
 * so the files that import it run unchanged in that copy.
 */
import type { MutationCtx } from '../_generated/server';

function isLoopback(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isSyntheticBackend() {
  const enabled = process.env.IS_TEST === 'true' && process.env.E2E_LOCAL_AUTH === 'true';
  const loopback = isLoopback(process.env.CONVEX_CLOUD_URL) && isLoopback(process.env.SITE_URL);
  return enabled && loopback;
}

export function requireSyntheticBackend() {
  if (!isSyntheticBackend()) {
    throw new Error('Play test controls require an isolated loopback backend');
  }
}

/** Password Auth keeps its default profile, and the hosted load backend admits only its run's accounts. */
export const syntheticIdentity = undefined;

/** A loopback backend takes any number of live test games, and the hosted load backend refuses a second. */
export async function limitLiveGames(_ctx: MutationCtx) {}
