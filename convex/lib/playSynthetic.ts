/*
 * The synthetic-backend seam for Play's test controls. The hosted load backend
 * (`scripts/play-load/hosted-backend.ts`) replaces this whole module with one bound to its target,
 * so the files that import it run unchanged in that copy.
 */
import type { MutationCtx } from '../_generated/server';
import { isIsolatedLoopbackBackend } from './isolatedBackend';

export function isSyntheticBackend() {
  return isIsolatedLoopbackBackend();
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
