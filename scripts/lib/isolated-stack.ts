/**
 * Returns the origin of an explicit `http://127.0.0.1:PORT` URL and throws for anything else, including a default port, a path, a query, a fragment and credentials.
 * `play-local.ts` and the local load runner pass every backend and Worker origin they are given through it before they build, start or call anything.
 * `verify-hosted-play.mjs` repeats the rule in its own loop, because the launcher runs it unbundled under whichever Node is on PATH, and a Node without default type stripping cannot import TypeScript.
 */
export function loopbackOrigin(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required; only an isolated local backend is supported.`);
  }
  const url = new URL(value);
  const explicitLoopback = new URL(`http://127.0.0.1:${url.port}`);
  if (!url.port || url.href !== explicitLoopback.href) {
    throw new Error(`${label} must be an explicit http://127.0.0.1:PORT origin.`);
  }
  return url.origin;
}
