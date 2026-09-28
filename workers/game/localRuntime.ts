/** The Git SHA `scripts/play-local.ts` gives both Workers of the isolated local stack in place of a commit. */
export const LOCAL_ISOLATED_GIT_SHA = 'local-isolated';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Whether this game Worker runs in the isolated local stack: it carries play-local's marker and serves a loopback origin.
 * A deployed Worker has neither, because its GIT_SHA is the commit it runs and its origin is public.
 * The test phase cooldown from a synthetic backend is accepted only here.
 */
export function isLocalIsolatedRuntime(env: { GIT_SHA: string; APPLICATION_ORIGIN: string }): boolean {
  if (env.GIT_SHA !== LOCAL_ISOLATED_GIT_SHA) {
    return false;
  }
  try {
    const origin = new URL(env.APPLICATION_ORIGIN);
    return origin.protocol === 'http:' && LOOPBACK_HOSTS.has(origin.hostname);
  } catch {
    return false;
  }
}
